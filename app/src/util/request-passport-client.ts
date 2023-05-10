import axios, { AxiosResponse } from 'axios';
import { Group } from "@semaphore-protocol/group";
import { SemaphoreSignaturePCD, SemaphoreSignaturePCDPackage } from "test-pcd-semaphore-signature-pcd";
import { PASSPORT_URL } from "../constants/zuzalu";
import {
  requestZuzaluRLNUrl,
  requestSemaphoreSignatureUrl,
} from "./passport-interface";
import { RLNPCD, RLNPCDPackage } from "./rln-pcd";

import { PCD, PCDPackage } from "@pcd/pcd-types";

import { serverUrl } from "../constants/constants";

// FIXME: reused from zk-chat-client
const DEFAULT_DEPTH = 16
const DEFAULT_GROUP_ID = "1"
const DEFAULT_SIGNED_MESSAGE = "zk-chat-get-identity-commitment";

// FIXME: currentPopup is used to keep track of the popup window and making sure there is only
// one popup window open at a time. This is a hacky solution and should be replaced with a
// better solution.
let currentPopup: Window | null = null;
// FIXME: currentMessageListener is used to keep track of the event listener for the popup window,
// to avoid registering more than 1 event listener at a time. This is a hacky solution and should
// be replaced with a better solution.
let currentMessageListener: ((event: MessageEvent) => void) | null = null;

export async function getPCDFromPassport(
  popupUrl: string,
  pkg: PCDPackage,
): Promise<PCD | undefined> {
  return new Promise(async (resolve, reject) => {
    const receiveMessage = (event: MessageEvent) => {
      const encodedPCD = event.data.encodedPCD;

      if (encodedPCD) {
        console.log("!@# getPCDFromPassport: Received PCD", encodedPCD);
        const parsedPCD = JSON.parse(decodeURIComponent(encodedPCD));
        if (parsedPCD.type !== pkg.name) {
          resolve(undefined);
        } else {
          pkg.deserialize(parsedPCD.pcd).then((pcd) => {
            // Remove the event listener when the promise is resolved.
            // window.removeEventListener("message", receiveMessage);
            // currentMessageListener = null;
            window.removeEventListener("message", receiveMessage);
            currentMessageListener = null;
            if (currentPopup) {
              if (!currentPopup.closed) {
                currentPopup.close();
              }
              currentPopup = null;
            }
            resolve(pcd as PCD);
          }).catch((err) => reject(err));
        }
      }
    };

    let isCleaningUp = false;
    const cleanup = () => {
      if (isCleaningUp) {
        return;
      }

      isCleaningUp = true;
      if (currentMessageListener) {
        window.removeEventListener("message", currentMessageListener);
        currentMessageListener = null;
      }

      if (currentPopup) {
        if (!currentPopup.closed) {
          currentPopup.close();
        }
        currentPopup = null;
      }
    };
    // Clean up previous windows and event listeners before opening a new one.
    cleanup();
    currentPopup = window.open(popupUrl, "popup", "width=600,height=600");
    if (!currentPopup) {
      reject(new Error("Failed to open the popup window."));
      return;
    }

    currentMessageListener = receiveMessage;
    window.addEventListener("message", receiveMessage);
  });
}

export async function getIdentityCommitment(
  messageToSign?: string,
  proveOnServer: boolean = false,
): Promise<SemaphoreSignaturePCD | undefined> {
  if (!messageToSign) {
    messageToSign = DEFAULT_SIGNED_MESSAGE;
  }
  const returnUrl = window.location.origin + "/popup";
  const popupUrl = requestSemaphoreSignatureUrl(
    PASSPORT_URL,
    returnUrl,
    messageToSign,
    proveOnServer
  );
  const res = await getPCDFromPassport(popupUrl, SemaphoreSignaturePCDPackage) ;
  if (res === undefined) {
    return undefined;
  } else {
    return res as SemaphoreSignaturePCD;
  }
}

async function getSlashedGroup(): Promise<Group> {
  const url = serverUrl + "/zk-chat/api/user/leaves";
  const res: AxiosResponse = await axios({
    method: 'GET',
    url,
    headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
    },
  });
  const data = res.data as string[];
  // data contains an array of leaves in hex without `0x`.
  // E.g. in the format `["270c97128e2ec97b40c5774cb7f1ebf9b7abe704a13de12ea8fab656f30f4107","345b74e96c572951c50285495f19c175338fe3e03a5a6a040bf8a8da1f1d4ec","35fc1eef2dc43bc0c13e54a5104743952121ce5f957e4623fe553f7881232a1"]`
  // We need to convert it to an array of decimal strings
  const members = data.map((leaf) => BigInt("0x" + leaf).toString());
  const group = new Group(DEFAULT_GROUP_ID, DEFAULT_DEPTH);
  group.addMembers(members);
  console.log("!@# getSlashedGroup: got slashed group from url=", url, ", root=", group.root)
  return group;
}


export async function generateRLNProof(
  epoch: bigint,
  signal: string,
  rlnIdentifier: bigint,
  proveOnServer = false,
): Promise<RLNPCD | undefined> {
  const returnUrl = window.location.origin + "/popup";
  const group = await getSlashedGroup();
  const popupUrl = requestZuzaluRLNUrl(
    PASSPORT_URL,
    returnUrl,
    group,
    rlnIdentifier.toString(),
    signal,
    epoch.toString(),
    proveOnServer
  );
  const res = await getPCDFromPassport(popupUrl, RLNPCDPackage) ;
  if (res === undefined) {
    return undefined;
  } else {
    return res as RLNPCD;
  }
}