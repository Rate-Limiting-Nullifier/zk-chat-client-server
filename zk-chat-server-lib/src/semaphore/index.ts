import { IGroup } from "../persistence/model/group/group.types";
import UserService from "../services/user.service";
import GroupService from "../services/group.service";
import { IGroupMember, ISemaphoreRepGroupV2 } from "./interfaces";
import PubSub from "../communication/pub_sub";
import { SyncType } from "../communication/socket/config";
import semaphoreFunctions from "./api";
import { IZKServerConfig } from "../types";

/**
 * Synchronize the Semaphore tree with the local database.
 *
 * The algorithms first retrieves all groups from Semaphore,
 * without any pagination assuming the number of existing groups is lower than 100. After that, it tries to check
 * the status of each loaded group with the group stored in the database. For any group which doesn't exist in the
 * database, or the size of the group stored in the database is lower than the size of the retrieved group,
 * the members are retrieved, using pagination, stored in the database, and the respective group is updated in the
 * database.
 */
class SemaphoreSynchronizer {

    private pubSub: PubSub;
    private groupService: GroupService;
    private userService: UserService;
    private config: IZKServerConfig;

    constructor(pubSub: PubSub, groupService: GroupService, userService: UserService, config: IZKServerConfig) {
        this.pubSub = pubSub;
        this.groupService = groupService;
        this.userService = userService;
        this.config = config;
    }

    /**
     * Sync commitments on startup, and schedule a job to sync on a regular interval.
     */
    public sync = async() => {
        console.log("!@# src/semaphore/index.ts::sync: this.config");
        await this.syncCommitmentsFromSemaphore();
        await this.continuousSync();
    }

    public syncCommitmentsFromSemaphore = async() => {
        // On startup
        // 1. Get all groups from Semaphore
        const allGroupsOnNet: ISemaphoreRepGroupV2[] = await semaphoreFunctions.getAllGroups(this.config.interepUrl);
        const groupsInDb: IGroup[] = await this.groupService.getGroups();

        let tree_root_changed = false;

        // 2. For each group, check the status in database. Only load new members for group if the size in db is different than the new size of the group
        for (let g of allGroupsOnNet) {
            const groupMembers = await this.loadGroupMembers(g.id);
            /*
                NICO's OBSERVATION: In the Zuzalu case, size = numberOfLeaves because the members are presented as a list.
                I think that the inner elements of Semaphore (RLN) do not delete members from the array but they just replace them with a zero value.
                Therefore size = active members and numberOfLeaves = total members.
                Regarding Zuzalu, I am not sure if size is variable.
            */
            // TODO: get the number of leaves from the group api
            // TODO: get the size of the leaves from the group api
            const numberOfLeaves = groupMembers.length;

            const groupInDb: IGroup | undefined = groupsInDb.find(x => x.group_id == g.id);
            if (groupInDb == undefined) {
                // Group doesn't exist in DB, load all members for that group, paginate over 100
                console.log("!@# src/semaphore/index.ts::syncCommitmentsFromSemaphore: groupInDb == undefined");
                try {
                    // Add all members to the tree
                    await this.userService.appendUsers(groupMembers, g.id);
                    // Persist the group
                    await this.groupService.saveGroup(g.id, 'Semaphore', g.name, numberOfLeaves, numberOfLeaves);

                    console.log("!@# src/semaphore/index.ts::syncCommitmentsFromSemaphore: tree_root_changed = true");
                    tree_root_changed = true;
                } catch (e) {
                    console.log("Unknown error while saving group", e);
                }
            } else {
                // Group exists locally, load new members only if the number of leaves in interep is > number of leaves stored locally
                if (numberOfLeaves > groupInDb.number_of_leaves) {
                    console.log(
                        "!@# src/semaphore/index.ts::syncCommitmentsFromSemaphore: numberOfLeaves > groupInDb.number_of_leaves, ",
                        "numberOfLeaves = ", numberOfLeaves, "groupInDb.number_of_leaves = ", groupInDb.number_of_leaves,
                     );
                    try {
                        // Add group members to the tree
                        await this.userService.appendUsers(groupMembers, g.id);
                        // Update group leaf count in DB
                        await this.groupService.updateNumberOfLeaves(g.id, numberOfLeaves);

                        console.log("!@# src/semaphore/index.ts::syncCommitmentsFromSemaphore: tree_root_changed = true (2)");
                        tree_root_changed = true;
                    } catch (e) {
                        console.log("Unknown error while saving group - appending new members", e);
                    }
                }
                // size is the number of active members in the group (not deleted)
                // Group exists locally, delete members that were removed from interep.
                if (numberOfLeaves != groupInDb.size) {
                    console.log("!@# src/semaphore/index.ts::syncCommitmentsFromSemaphore: updating slashed members");
                    // Load all deleted indexes from interep
                    const indexesOfRemovedMembers: number[] = await this.loadRemovedGroupMembers(g.id);
                    try {
                        // Remove members from the tree
                        await this.userService.removeUsersByIndexes(indexesOfRemovedMembers, groupInDb.group_id);

                        // Update group size in DB
                        await this.groupService.updateSize(g.id, numberOfLeaves);

                        tree_root_changed = true;
                    } catch (e) {
                        console.log("Unknown error while saving group - removing deleted members", e);
                    }
                }
            }
        }

        console.log("!@# src/semaphore/index.ts::syncCommitmentsFromSemaphore: tree_root_changed = ", tree_root_changed);

        // Publish event only when tree root hash changed
        if (tree_root_changed) {
            this.publishEvent();
            console.log("!@# src/semaphore/index.ts::syncCommitmentsFromSemaphore: this.publishEvent");
        }
    }

    private async loadGroupMembers(id: string): Promise<IGroupMember[]> {
        let members = await semaphoreFunctions.getMembersForGroup(this.config.interepUrl, id);
        return members;
    }

    private async loadRemovedGroupMembers(id: string): Promise<number[]> {
        let indexesOfDeletedMembers = await semaphoreFunctions.getRemovedMembersForGroup(this.config.interepUrl, id);
        return indexesOfDeletedMembers;
    }

    private async continuousSync() {
        setInterval(async() => {
            console.log("Syncing with Semaphore!");
            await this.syncCommitmentsFromSemaphore();
        }, this.config.interepSyncIntervalSeconds * 1000);
    }

    private publishEvent() {
        this.pubSub.publish({
            type: SyncType.EVENT,
            message: "TREE_UPDATE"
        })
    }
}

export default SemaphoreSynchronizer