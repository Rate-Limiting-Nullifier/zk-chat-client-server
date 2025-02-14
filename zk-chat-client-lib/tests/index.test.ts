import { jest, test, expect, describe, beforeEach, afterAll } from '@jest/globals'
import { ServerCommunication } from '../src/communication/index';
import { StorageProvider } from '../src/storage/interfaces';
const ws = require("ws");
import { randomText } from './crypto/web_cryptography.test';

import {
    init,
    get_rooms,
    send_message,
    receive_message,
    create_public_room,
    join_public_room,
    create_private_room,
    invite_private_room,
    join_private_room,
    create_direct_room,
    get_chat_history,
    sync_message_history,
    delete_messages_for_room,
    get_messages_for_room,
    get_public_key,
    export_profile,
    recover_profile,
    get_contacts,
    get_contact,
    insert_contact,
    delete_contact,
    update_contact,
    update_username,
    get_username,
    get_user_handle,
    IFuncGenerateProof,
    IStorageArtifacts
} from '../src/index';

import ProfileManager from '../src/profile';
import { ICryptography, IKeyPair } from '../src/crypto/interfaces';
import ChatManager from '../src/chat';
import WebCryptography from '../src/crypto/web_cryptography';
import KeyExchangeManager from '../src/key-exchange';
import { RLNFullProof } from 'rlnjs';


/**
 * When running tests with jest, there's an issue with circomlibjs dependencies, related to ethereum utils.
 * Mocking that here with a deterministic mock for posseidon hasher.
 */
jest.mock("../src/hasher", () => {
    return jest.fn().mockImplementation(() => {
        return {
            genSignalHash: (data: string) => {
                return data;
            },
            genExternalNullifier: (data: string): string => {
                return data;
            },
            genWitness: (identitySecret, witness, externalNullifier, signal, rln_id) => {
                return "witness_" + identitySecret[0].toString();
            },
            genProof: async (proofWitness, circuit_path, key_path) => {
                return {
                    proof: "test_proof_" + proofWitness
                }
            },
            calculateOutput: (identitySecret, externalNullifier, xShare, share_count, rln_id) => {
                return [BigInt(11111), BigInt(22222)]
            }
        }
    });
})

const send_message_socket = jest.fn();
const open_event = jest.fn();

const receive_message_socket = jest.fn();

jest.mock("ws", () => {
    return jest.fn().mockImplementation(() => {
        return {
            send: data => {
                send_message_socket(data);
            },
            on: (event, callback) => {
                if (event == 'open') {
                    open_event(event);
                    callback();
                } else if (event == 'message') {
                    receive_message_socket("test message");
                    callback("test message");
                }
            }
        }
    });
});

class TestStorageProvider implements StorageProvider {

    private data = {}

    constructor() { }

    public async save(key: string, data: string) {
        this.data[key] = data;
    };

    public async load(key: string): Promise<string> {
        const retrievedItem = this.data[key];

        return new Promise((res, rej) => {
            if (retrievedItem)
                res(retrievedItem)
            else
                rej("Requested item was not found");
        })
    };

}

class LocalTestCryptography implements ICryptography {

    private seed: number;

    constructor(seed: number) {
        this.seed = seed;
    }

    generateSymmetricKey = async (): Promise<string> => {
        return (this.seed * 1111).toString();
    };

    generateECDHKeyPair = async(): Promise<IKeyPair> => {
        return this.generateKeyPair()
    }

    deriveSharedSecretKey = async(sourcePrivateKey: string, targetPublicKey: string): Promise<string> => {
        return "derived-" + sourcePrivateKey + targetPublicKey;
    }

    generateKeyPair = async (): Promise<IKeyPair> => {
        const privateKey = this.seed * 1111;
        const publicKey = (this.seed * 12345) ^ privateKey;

        return {
            publicKey: publicKey.toString(),
            privateKey: privateKey.toString()
        }
    };

    encryptMessageSymmetric = async (message: string, symmetricKey: string): Promise<string> => {
        return message + "||" + symmetricKey;
    }

    decryptMessageSymmetric = async (cyphertext: string, symmetricKey: string): Promise<string> => {
        return cyphertext.substring(0, cyphertext.indexOf('||'));
    }

    encryptMessageAsymmetric = async (message: string, publicKey: string): Promise<string> => {
        return message + "||" + publicKey;
    };

    decryptMessageAsymmetric = async (cyphertext: string, privateKey: string): Promise<string> => {
        return cyphertext.substr(0, cyphertext.indexOf('||'));
    }

    hash = (data: string): string => {
        return "hash-" + data;
    }
}

describe('Test main', () => {

    const proof_generator_callback: IFuncGenerateProof = async (epoch: string, signal: string, storage_artifacts: IStorageArtifacts, rln_identitifer: string): Promise<RLNFullProof> => {
        return {
            snarkProof: {
                proof: {
                    pi_a: ["pi_a"],
                    pi_b: [["pi_b"]],
                    pi_c: ["pi_c"],
                    protocol: "p",
                    curve: "c"
                },
                publicSignals: {
                    yShare: BigInt(123).toString(),
                    merkleRoot: BigInt(123).toString(),
                    internalNullifier: BigInt(123).toString(),
                    signalHash: BigInt(123).toString(),
                    externalNullifier: BigInt(123).toString(),
                }
            },
            epoch: BigInt(123),
            rlnIdentifier: BigInt(123),
        };
    }

    beforeEach(async () => {
        jest.restoreAllMocks();
    });

    afterAll(async() => {
        jest.restoreAllMocks();
    })

    test('init - default params, no profile exists', async () => {
        jest.spyOn(ServerCommunication.prototype, "init").mockImplementation(() => {
            return new Promise((res, rej) => {res()});
        });
        jest.spyOn(ProfileManager.prototype, "loadProfile").mockResolvedValue(false);

        try {
            await init({
                serverUrl: "test1",
                socketUrl: "ws://test2"
            },
            proof_generator_callback);
            expect(true).toBeFalsy();
        } catch(e) {
            expect(true).toBeTruthy();
        }
    });

    test('init - default params, profile exists', async () => {
        jest.spyOn(ServerCommunication.prototype, "init").mockImplementation(() => {
            return new Promise((res, rej) => { res() });
        });

        jest.spyOn(ProfileManager.prototype, "loadProfile").mockResolvedValue(true);

        await init({
            serverUrl: "test1",
            socketUrl: "ws://test2"
        },
        proof_generator_callback);
        expect(true).toBeTruthy();
    });

    test('init - new profile', async () => {
        const initProfileSpy = await init_new_profile();
        expect(initProfileSpy).toHaveBeenCalled();
    });

    test('init - new profile and custom cryptography and storage', async () => {
        jest.spyOn(ServerCommunication.prototype, "init").mockImplementation(() => {
            return new Promise((res, rej) => { res() });
        });

        jest.spyOn(ProfileManager.prototype, "loadProfile").mockResolvedValue(true);
        jest.spyOn(ServerCommunication.prototype, "getLeaves").mockResolvedValue(["111", "222", "333"]);
        jest.spyOn(ServerCommunication.prototype, "getRlnRoot").mockResolvedValue("test root");

        const initProfileSpy = jest.spyOn(ProfileManager.prototype, "initProfile").mockResolvedValue();

        await init({
                serverUrl: "test1",
                socketUrl: "ws://test2"
            },
            proof_generator_callback,
            "test_id_commitment",
            new TestStorageProvider(),
            new LocalTestCryptography(1000));
        expect(initProfileSpy).toHaveBeenCalled();
    });

    test('get rooms', async () => {
        // No profile
        try {
            await get_rooms();
            expect(true).toBeFalsy();
        } catch(e) {
            expect(true).toBeTruthy();
        }

        // With profile
        await init_new_profile();
        jest.spyOn(ProfileManager.prototype, "getRooms").mockResolvedValue({
            public: [],
            private: [],
            direct: []
        });
        const rooms = await get_rooms();
        expect(rooms).not.toBeNull();
    });

    test('send message', async () => {
        // No profile
        try {
            await send_message("test-room-1", "message");
            expect(true).toBeFalsy();
        } catch (e) {
            expect(true).toBeTruthy();
        }

        // With profile
        await init_new_profile();
        const chatSpy = jest.spyOn(ChatManager.prototype, "sendMessage").mockResolvedValue();
        await send_message("test-room-1", "message");
        expect(chatSpy).toHaveBeenCalled();
    });

    test('receive message', async () => {
        // No profile
        try {
            await receive_message((var1, var2) => {});
            expect(true).toBeFalsy();
        } catch (e) {
            expect(true).toBeTruthy();
        }

        // With profile
        await init_new_profile();
        const chatSpy = jest.spyOn(ChatManager.prototype, "registerReceiveMessageHandler").mockResolvedValue();
        await receive_message((var1, var2) => { });
        expect(chatSpy).toHaveBeenCalled();
    });

    test('create public room', async () => {
        // No profile
        try {
            await create_public_room("test room 1");
            expect(true).toBeFalsy();
        } catch (e) {
            expect(true).toBeTruthy();
        }

        // With profile
        await init_new_profile();

        // Long text
        const randomText1 = randomText(ProfileManager.ROOM_NAME_MAX_LENGTH + 5);
        try {
            await create_public_room(randomText1);
            expect(true).toBeFalsy();
        } catch (e) {
            expect(e).toContain("Room name cannot have more than");
            expect(true).toBeTruthy();
        }

        // Server error
        jest.spyOn(WebCryptography.prototype, "generateSymmetricKey").mockResolvedValue("test symm key");
        jest.spyOn(ServerCommunication.prototype, "createPublicRoom").mockImplementation(async (id, name, symm) => {
            return null;
        });
        try {
            await create_public_room("test room 1");
            expect(true).toBeFalsy();
        } catch (e) {
            expect(e).toContain("Server error");
            expect(true).toBeTruthy();
        }

        // Room exists
        jest.spyOn(WebCryptography.prototype, "generateSymmetricKey").mockResolvedValue("test symm key");
        jest.spyOn(ServerCommunication.prototype, "createPublicRoom").mockImplementation(async (id, name, symm) => {
            return "created";
        });
        jest.spyOn(ProfileManager.prototype, "addPublicRoom").mockImplementation(async(room)=> {
            throw "Room already exists"
        })
        try {
            await create_public_room("test room 1");
            expect(true).toBeFalsy();
        } catch (e) {
            expect(e).toContain("Room already exists");
            expect(true).toBeTruthy();
        }

        // Success
        jest.spyOn(WebCryptography.prototype, "generateSymmetricKey").mockResolvedValue("test symm key");
        jest.spyOn(ServerCommunication.prototype, "createPublicRoom").mockImplementation(async (id, name, symm) => {
            return "created";
        });
        jest.spyOn(ProfileManager.prototype, "addPublicRoom").mockImplementation(async (room) => {

        })

        await create_public_room("test room 1");
        expect(true).toBeTruthy();
    });

    test('join public room', async () => {
        // No profile
        try {
            await join_public_room("id-1");
            expect(true).toBeFalsy();
        } catch (e) {
            expect(true).toBeTruthy();
        }

        // With profile
        await init_new_profile();

        // Room exists
        jest.spyOn(ProfileManager.prototype, "getRoomById").mockResolvedValueOnce("exists");

        try {
            await join_public_room("id-1");
            expect(true).toBeFalsy();
        } catch(e){
            expect(e).toContain("Room already exists as part of your profile");
            expect(true).toBeTruthy();
        }

        // Room doesn't exist on server
        jest.spyOn(ProfileManager.prototype, "getRoomById").mockImplementation(async (id) => {
            throw "Not exists locally"
        });
        jest.spyOn(ServerCommunication.prototype, "getPublicRoom").mockResolvedValue(null);
        try {
            await join_public_room("id-1");
            expect(true).toBeFalsy();
        } catch (e) {
            expect(e).toEqual("Unknown room");
            expect(true).toBeTruthy();
        }

        // Joins
        jest.spyOn(ServerCommunication.prototype, "getPublicRoom").mockResolvedValue({
            uuid: "test",
            name: "test",
            symmetric_key: "test",
        });
        const profileManagerSpy = jest.spyOn(ProfileManager.prototype, "addPublicRoom").mockImplementation(async(room) => {});
        await join_public_room("test-1");
        expect(profileManagerSpy).toHaveBeenCalled();
    });

    test('create private room', async () => {
        // No profile
        try {
            await create_private_room("test room 1");
            expect(true).toBeFalsy();
        } catch (e) {
            expect(true).toBeTruthy();
        }

        // With profile
        await init_new_profile();

        // Long text
        const randomText1 = randomText(ProfileManager.ROOM_NAME_MAX_LENGTH + 5);
        try {
            await create_private_room(randomText1);
            expect(true).toBeFalsy();
        } catch (e) {
            expect(e).toContain("Room name cannot have more than");
            expect(true).toBeTruthy();
        }

        // Room exists
        jest.spyOn(WebCryptography.prototype, "generateSymmetricKey").mockResolvedValue("test symm key");
        jest.spyOn(ProfileManager.prototype, "addPrivateRoom").mockImplementation(async (room) => {
            throw "Room already exists"
        })
        try {
            await create_private_room("test room 1");
            expect(true).toBeFalsy();
        } catch (e) {
            expect(e).toContain("Room already exists");
            expect(true).toBeTruthy();
        }

        // Success
        jest.spyOn(WebCryptography.prototype, "generateSymmetricKey").mockResolvedValue("test symm key");
        jest.spyOn(ProfileManager.prototype, "addPrivateRoom").mockImplementation(async (room) => {

        })

        await create_private_room("test room 1");
        expect(true).toBeTruthy();
    });

    test('invite private room', async () => {
        // No profile
        try {
            await invite_private_room("id-1", "recepient-key");
            expect(true).toBeFalsy();
        } catch (e) {
            expect(true).toBeTruthy();
        }

        // With profile
        await init_new_profile();

        // Room doesn't exist
        jest.spyOn(ProfileManager.prototype, "getRoomById").mockImplementation(async (room) => {
            throw "Room doesn't exist"
        });

        try {
            await invite_private_room("id-1", "recepient-key");
            expect(true).toBeFalsy();
        } catch (e) {
            expect(e).toContain("Room doesn't exist");
            expect(true).toBeTruthy();
        }

        // Success
        jest.spyOn(WebCryptography.prototype, "encryptMessageAsymmetric").mockResolvedValue("encrypted invite");
        jest.spyOn(ProfileManager.prototype, "getRoomById").mockImplementation(async (room) => {
            return {
                id: "test",
                name: "test",
                type: "test",
                symmetric_key: "test"
            }
        });

        const invitation = await invite_private_room("id-1", "recepient-key");
        expect(invitation).toEqual("encrypted invite");
    });

    test('join private room', async () => {
        // No profile
        try {
            await join_private_room("invite");
            expect(true).toBeFalsy();
        } catch (e) {
            expect(true).toBeTruthy();
        }

        // With profile
        await init_new_profile();

        jest.spyOn(WebCryptography.prototype, "decryptMessageAsymmetric").mockResolvedValue(JSON.stringify(["test_key", "test_id", "test_name"]));
        jest.spyOn(ProfileManager.prototype, "getPrivateKey").mockResolvedValue("test private key");
        const addPrivateRoomSpy = jest.spyOn(ProfileManager.prototype, "addPrivateRoom").mockImplementation(async (room) => {});

        await join_private_room("invite");
        expect(addPrivateRoomSpy).toHaveBeenCalled();
    });

    test('create direct room', async () => {
        jest.spyOn(KeyExchangeManager.prototype, "init").mockImplementation(() => {});
        const bundleSaveSpy = jest.spyOn(KeyExchangeManager.prototype, "saveKeyExchangeBundle").mockImplementation(async(dhPublicKey: string, receiverPublicKey: string) => {});

        // No profile
        try {
            await create_direct_room("test-room", "public key");
            expect(true).toBeFalsy();
        } catch (e) {
            expect(true).toBeTruthy();
        }

        // With profile
        await init_new_profile();

        // Long text
        const randomText1 = randomText(ProfileManager.ROOM_NAME_MAX_LENGTH + 5);
        try {
            await create_direct_room(randomText1, "public key")
            expect(true).toBeFalsy();
        } catch (e) {
            expect(e).toContain("Room name cannot have more than");
            expect(true).toBeTruthy();
        }

        // Room exists
        jest.spyOn(WebCryptography.prototype, "generateECDHKeyPair").mockResolvedValue({
            publicKey: "public",
            privateKey: "private"
        });
        jest.spyOn(ProfileManager.prototype, "addDirectRoom").mockImplementation(async (room) => {
            throw "Room already exists"
        })
        try {
            await create_direct_room("test room 1", "public key")
            expect(true).toBeFalsy();
        } catch (e) {
            expect(e).toContain("Room already exists");
            expect(true).toBeTruthy();
        }

        // Success
        jest.spyOn(WebCryptography.prototype, "generateECDHKeyPair").mockResolvedValue({
            publicKey: "public",
            privateKey: "private"
        });
        const addRoomSpy = jest.spyOn(ProfileManager.prototype, "addDirectRoom").mockImplementation(async (room) => {})

        await create_direct_room("test-room", "public key")
        expect(addRoomSpy).toHaveBeenCalled();
        expect(bundleSaveSpy).toHaveBeenCalled();
    });

    test('get chat history', async () => {
        // No profile
        try {
            await get_chat_history();
            expect(true).toBeFalsy();
        } catch (e) {
            expect(true).toBeTruthy();
        }

        // With profile
        await init_new_profile();

        jest.spyOn(ProfileManager.prototype, "getRoomIds").mockResolvedValue(["id-1", "id-2"]);
        jest.spyOn(ServerCommunication.prototype, "getChatHistory").mockResolvedValue([
            {
                uuid: "id-1",
                message: "encrypted message 1",
                epoch: 1
            },
            {
                uuid: "id-2",
                message: "encrypted message 2",
                epoch: 2
            },
            {
                uuid: "id-3",
                message: "encrypted message 2",
                epoch: 3
            }
        ]);
        jest.spyOn(ChatManager.prototype, "decryptMessage").mockImplementation(async(message)=> {
            if (message.uuid == 'id-1') {
                return [{
                    uuid: "id-1",
                    chat_type: "PUBLIC",
                    message_content: "Decrypted 1",
                    epoch: 1,
                    timestamp: 1,
                    sender: "Sender"
                }, 'room-1'];
            }
            if (message.uuid == 'id-2') {
                return [{
                    uuid: "id-2",
                    chat_type: "PUBLIC",
                    message_content: "Decrypted 2",
                    epoch: 2,
                    timestamp: 2,
                    sender: "Sender"
                }, 'room-1'];
            }
            if (message.uuid == 'id-3') {
                return [{
                    uuid: "id-3",
                    chat_type: "PUBLIC",
                    message_content: "Decrypted 3",
                    epoch: 3,
                    timestamp: 3,
                    sender: "Sender"
                }, 'room-2'];
            }

            return [null, null];
        })

        const chatHistory = await get_chat_history();
        expect(Object.keys(chatHistory)).toEqual(['room-1', 'room-2']);
        expect(chatHistory['room-1'].length).toEqual(2);
        expect(chatHistory['room-2'].length).toEqual(1);
    });

    test('sync message history', async() => {
        // No profile
        try {
            await sync_message_history();
            expect(true).toBeFalsy();
        } catch (e) {
            expect(true).toBeTruthy();
        }

        // With profile
        await init_new_profile();

        const spy = jest.spyOn(ChatManager.prototype, "syncMessagesForAllRooms").mockResolvedValue();

        await sync_message_history();

        expect(spy).toHaveBeenCalled();
    })

    test('delete messages for room', async () => {
        // No profile
        try {
            await delete_messages_for_room("id-1");
            expect(true).toBeFalsy();
        } catch (e) {
            expect(true).toBeTruthy();
        }

        // With profile
        await init_new_profile();

        const spy = jest.spyOn(ChatManager.prototype, "deleteMessageHistoryForRoom").mockResolvedValue();

        await delete_messages_for_room("id-1");

        expect(spy).toHaveBeenCalled();
    })

    test('get messages for room', async () => {
        // No profile
        try {
            await get_messages_for_room("id-1", 1);
            expect(true).toBeFalsy();
        } catch (e) {
            expect(true).toBeTruthy();
        }

        // With profile
        await init_new_profile();

        const spy = jest.spyOn(ChatManager.prototype, "loadMessagesForRoom").mockResolvedValue(
            [
                {
                    uuid: "1",
                    epoch: 100,
                    chat_type: "PUBLIC",
                    message_content: "content 1",
                    timestamp: 100,
                    sender: "Sender"
                },
                {
                    uuid: "2",
                    epoch: 102,
                    chat_type: "PUBLIC",
                    message_content: "content 2",
                    timestamp: 102,
                    sender: "Sender"
                }
            ]);

        await get_messages_for_room("id-1", 1);

        expect(spy).toHaveBeenCalled();
    })

    test('get public key', async () => {
        // No profile
        try {
            await get_public_key();
            expect(true).toBeFalsy();
        } catch (e) {
            expect(true).toBeTruthy();
        }

        // With profile
        await init_new_profile();

        jest.spyOn(ProfileManager.prototype, "getPublicKey").mockResolvedValue("test key");

        expect(await get_public_key()).toEqual("test key");
    });

    test('get contacts', async () => {
        // No profile
        try {
            await get_contacts();
            expect(true).toBeFalsy();
        } catch (e) {
            expect(true).toBeTruthy();
        }

        // With profile
        await init_new_profile();

        jest.spyOn(ProfileManager.prototype, "getTrustedContacts").mockReturnValue({
            "test": {
                name: "test",
                publicKey: "test key"
            }
        });

        expect(await get_contacts()).toEqual({
            "test": {
                name: "test",
                publicKey: "test key"
            }
        });
    });

    test('update username', async () => {
        // No profile
        try {
            await update_username("test");
            expect(true).toBeFalsy();
        } catch (e) {
            expect(true).toBeTruthy();
        }

        // With profile
        await init_new_profile();

        jest.spyOn(ProfileManager.prototype, "updateUsername").mockResolvedValue();
        jest.spyOn(ProfileManager.prototype, "getUserName").mockReturnValue("test-updated");

        await update_username("test-updated");
        expect(await get_username()).toEqual("test-updated");
    });

    test('get user handle', async () => {
        // No profile
        try {
            await get_user_handle();
            expect(true).toBeFalsy();
        } catch (e) {
            expect(true).toBeTruthy();
        }

        // With profile
        await init_new_profile();

        jest.spyOn(ProfileManager.prototype, "getUserHandle").mockReturnValue("test-handle");

        expect(await get_user_handle()).toEqual("test-handle");
    });

    test('get contact', async () => {
        // No profile
        try {
            await get_contact("test");
            expect(true).toBeFalsy();
        } catch (e) {
            expect(true).toBeTruthy();
        }

        // With profile, doesnt exist
        await init_new_profile();

        jest.spyOn(ProfileManager.prototype, "getTrustedContact").mockImplementation((name) => {
            throw "doesn't exist"
        });

        try {
            await get_contact("sm");
            expect(true).toBeFalsy();
        } catch(e) {
            expect(true).toBeTruthy();
        }

        // With profile, exists
        jest.spyOn(ProfileManager.prototype, "getTrustedContact").mockImplementation((name) => {
            return {
                name: "test",
                publicKey: "test key"
            }
        });
        const contact = await get_contact("test");
        expect(contact.name).toEqual('test');
        expect(contact.publicKey).toEqual('test key');
    });

    test('insert contact', async () => {
        // No profile
        try {
            await insert_contact("test", "test");
            expect(true).toBeFalsy();
        } catch (e) {
            expect(true).toBeTruthy();
        }

        // With profile, already exists
        await init_new_profile();

        jest.spyOn(ProfileManager.prototype, "insertTrustedContact").mockImplementation((name, key) => {
            throw "Contact already exists";
        });

        try {
            await insert_contact("test", "test");
            expect(true).toBeFalsy();
        } catch (e) {
            expect(true).toBeTruthy();
        }

        // With profile, doesn't exist
        jest.spyOn(ProfileManager.prototype, "insertTrustedContact").mockResolvedValue();
        await insert_contact("test", "test");
    });

    test('delete contact', async () => {
        // No profile
        try {
            await delete_contact("test");
            expect(true).toBeFalsy();
        } catch (e) {
            expect(true).toBeTruthy();
        }

        // With profile, doesnt exist
        await init_new_profile();

        jest.spyOn(ProfileManager.prototype, "deleteTrustedContact").mockImplementation((name) => {
            throw "Doesnt exist";
        });

        try {
            await delete_contact("test");
            expect(true).toBeFalsy();
        } catch (e) {
            expect(true).toBeTruthy();
        }

        // With profile, exists
        jest.spyOn(ProfileManager.prototype, "deleteTrustedContact").mockResolvedValue();
        await delete_contact("test");
    });

    test('update contact', async () => {
        // No profile
        try {
            await update_contact("old", "new", "pub key");
            expect(true).toBeFalsy();
        } catch (e) {
            expect(true).toBeTruthy();
        }

        // With profile, doesnt exist
        await init_new_profile();

        jest.spyOn(ProfileManager.prototype, "updateTrustedContact").mockImplementation((old_name, new_name, pub_key) => {
            throw "Doesnt exist";
        });

        try {
            await update_contact("test", "test2", "pub key");
            expect(true).toBeFalsy();
        } catch (e) {
            expect(true).toBeTruthy();
        }

        // With profile, exists
        jest.spyOn(ProfileManager.prototype, "updateTrustedContact").mockResolvedValue();
        await update_contact("test", "test2", "pub key");
    });

    test('export profile', async () => {
        // No profile
        try {
            await export_profile();
            expect(true).toBeFalsy();
        } catch (e) {
            expect(true).toBeTruthy();
        }

        // With profile
        await init_new_profile();

        jest.spyOn(ProfileManager.prototype, "exportProfile").mockResolvedValue("test profile");

        expect(await export_profile()).toEqual("test profile");
    });

    test('recover profile', async () => {
        // Init not called
        const profile = JSON.stringify({ key: "value" });
        try {
            await recover_profile(profile);
            expect(true).toBeFalsy();
        } catch (e) {
            expect(true).toBeTruthy();
        }

        // With profile
        await init_new_profile();

        // Invalid format
        jest.spyOn(ProfileManager.prototype, "validateFormat").mockResolvedValue(false);

        try {
            await recover_profile(profile);
            expect(true).toBeFalsy();
        } catch (e) {
            expect(e).toEqual("Profile data invalid");
            expect(true).toBeTruthy();
        }

        // Success
        jest.spyOn(ProfileManager.prototype, "validateFormat").mockResolvedValue(true);
        jest.spyOn(ChatManager.prototype, "setRootObsolete").mockImplementation(async() => {});
        jest.spyOn(ChatManager.prototype, "checkRootUpToDate").mockImplementation(async () => { });
        const spy = jest.spyOn(ProfileManager.prototype, "recoverProfile").mockImplementation(async(pr) => {});


        await recover_profile(profile);
        expect(spy).toHaveBeenCalled();
    });

    const init_new_profile = async () => {
        jest.spyOn(ServerCommunication.prototype, "init").mockImplementation(() => {
            return new Promise((res, rej) => { res() });
        });

        jest.spyOn(ProfileManager.prototype, "loadProfile").mockResolvedValue(true);
        jest.spyOn(ServerCommunication.prototype, "getLeaves").mockResolvedValue(["111", "222"]);
        jest.spyOn(ServerCommunication.prototype, "getRlnRoot").mockResolvedValue("test root");

        const initProfileSpy = jest.spyOn(ProfileManager.prototype, "initProfile").mockResolvedValue();

        await init({
            serverUrl: "test1",
            socketUrl: "ws://test2"
        },
        proof_generator_callback,
        "test_id_commitment");

        return initProfileSpy;
    }

});