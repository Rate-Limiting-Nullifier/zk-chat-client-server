// Copy the server-lib interep impementation to a pcd implementation that fetches https://api.pcd-passport.com/semaphore/1 instead of the interep api.

import axios from 'axios';
import { IGroupMember, ISemaphoreRepGroupV2 } from "./interfaces";

// semaphore group: hash(DEFAULT_SEMAPHORE_GROUP)
// Ref: https://github.com/semaphore-protocol/semaphore/blob/22f33a8f263cb447417faeee68664046b4d716b4/packages/group/src/group.ts#L22
export const DEFAULT_ZERO_VALUE = BigInt("312829776796408387545637016147278514583116203736587368460269838669765409292")

/**
 * Returns only the supported groups
 */
const getAllGroups = async (baseUrl: string): Promise<ISemaphoreRepGroupV2[]> => {
    // TODO: create a new endpoint in the zupass api that returns only the supported groups
    return [
        {
            id: '1',
            name: 'Zuzalu Participants',
            deep: 16,
        },
        // {
        //     id: '2',
        //     name: 'Zuzalu Residents',
        //     deep: 16,
        // },
        // {
        //     id: '3',
        //     name: 'Zuzalu Visitors',
        //     deep: 16,
        // }
    ]
};

/**
 * Returns an ordered list of members in the group.
 */
const getMembersForGroup = async (baseUrl: string, id: string): Promise<IGroupMember[]> => {
    const url = baseUrl + `/semaphore/${id}`;
    try {
        const res = await axios({
            method: 'GET',
            timeout: 5000,
            url,
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            }
        });
        const members: IGroupMember[] = res.data.members.map((member: string, index: number) => {
            return {
                index,
                identityCommitment: member
            }
        })
        return members;
    } catch (e) {
        console.log("Exception while loading members of the group: ", id);
        return [];
    }
}

/**
 * Returns an ordered list of the leaf indexes of removed members in the group.
 */
const getRemovedMembersForGroup = async (baseUrl: string, id: string): Promise<number[]> => {
    const url = baseUrl + `/semaphore/${id}`;
    try {
        const res = await axios({
            method: 'GET',
            timeout: 5000,
            url,
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            }
        });
        const removedMembers: number[] = res.data.members
            .filter((member:string) => member === DEFAULT_ZERO_VALUE.toString())
            .map((member: string, index: number) => {
                return {
                    index,
                    identityCommitment: member
                }
            })
        return removedMembers;
    } catch (e) {
        console.log("Exception while loading removed members of the group: ", id);
        return [];
    }
}

const apiFunctions = {
    getAllGroups,
    getMembersForGroup,
    getRemovedMembersForGroup
}

export default apiFunctions