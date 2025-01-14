import { RLNFullProof } from 'rlnjs';

/**
 * The message that each client sends to the server
 */
export interface RLNMessage {
    zk_proof: RLNFullProof;
    x_share: string;
    epoch: string;
    chat_type: string;
    message_content: string;
    sender: string;
}

export const constructRLNMessage = (parsedJson: any): RLNMessage => {
    const keys: string[] = Object.keys(parsedJson);

    if (keys.length != 6)
        throw "Bad message";

    const interfaceKeys: string[] = [
        "zk_proof", "x_share", "epoch", "chat_type", "message_content", "sender"
    ];

    for (let iK of interfaceKeys) {
        if (keys.indexOf(iK) == -1) {
            console.log("key does not exist ", iK);
            throw "Bad message";
        }
    }

    return {
        zk_proof: parsedJson.zk_proof,
        x_share: parsedJson.x_share,
        epoch: parsedJson.epoch,
        chat_type: parsedJson.chat_type,
        message_content: parsedJson.message_content,
        sender: parsedJson.sender
    }
}

export const getNullifierFromFullProof = (proof: RLNFullProof): string => {
    return proof.snarkProof.publicSignals.internalNullifier.toString();
}

export const getYShareFromFullProof = (proof: RLNFullProof): string => {
    return proof.snarkProof.publicSignals.yShare.toString();
}