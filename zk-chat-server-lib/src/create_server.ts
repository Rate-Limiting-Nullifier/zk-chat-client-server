import express, { Router } from "express";
import { createSocketServer, createRedisPubSub, createNodeSync } from "./communication"
import { createMessageHandler, createUserService, groupService, requestStatsService, createKeyExchangeService, keyExchangeRequestStatsService, publicRoomService } from "./services"
import { initDb } from "./persistence/db";
import { seedZeros } from "./util/seed";
import { runMessageCleanupJob } from "./jobs/cleanup";
import { chatRouter, roomRouter, getUserRouter, getKeyExchangeRouter } from "./controllers";

import PubSub from "./communication/pub_sub";
import SocketServer from "./communication/socket/socket_server";
import MessageHandlerService from "./services/message_handler_service";
import NodeSynchronizer from "./communication/node_sync";
import SemaphoreSynchronizer from "./semaphore";
import Hasher from "./util/hasher";
import UserService from "./services/user.service";
import KeyExchangeService from "./services/key_exchange_service";
import { IZKServerConfig } from "./types";
import { MongoError } from "mongodb";
// import { MongoError } from "mongodb";


// FIXME: right now we just hardcode the default chatroom, but we should probably make it configurable
const defaultPublicRoom = {
    "uuid": "c44e8b47-2c9e-4575-b87d-70ee9f2e1a2f",
    "name": "Lobby",
    "symmetric_key": "{\"alg\":\"A128GCM\",\"ext\":true,\"k\":\"clgPxSs2Tk9xKGYrTNU8eA\",\"key_ops\":[\"encrypt\",\"decrypt\"],\"kty\":\"oct\"}"
}

const errorPatternPublicRoomExists = "MongoError: E11000 duplicate key error collection";

const tryCreateDefaultChatroom = async () => {
    try {
        await publicRoomService.saveRoom(
            defaultPublicRoom.uuid,
            defaultPublicRoom.name,
            defaultPublicRoom.symmetric_key,
        );
    } catch(e) {
        if (String(e).indexOf(errorPatternPublicRoomExists) !== -1) {
            console.log("Default public room already exists, skipping creation");
        } else {
            throw e;
        }
    }
}

var cors = require("cors");

const createServer = (chatRouter: Router, roomRouter: Router, userRouter: Router, keyExchangeRouter: Router) => {

    const app = express();
    app.use(cors());
    app.options("*", cors());

    app.use(express.json());

    app.use("/zk-chat/api/chat", chatRouter);
    app.use("/zk-chat/api/user", userRouter);
    app.use("/zk-chat/api/public_room", roomRouter);
    app.use("/zk-chat/api/key_exchange", keyExchangeRouter);


    return app;
}

const initZKChatServer = async (config: IZKServerConfig) => {
    console.log("!@# initZKChatServer..., zeroValue: ", config.zeroValue);

    await initDb(config.dnConnectionString);

    await seedZeros(config.zeroValue, config.merkleTreeLevels);

    const redisPubSub: PubSub = createRedisPubSub(config);

    const userService: UserService = createUserService(config);

    const keyExchangeService: KeyExchangeService = createKeyExchangeService(config, userService, keyExchangeRequestStatsService, new Hasher());

    const semaphoreSynchronizer = new SemaphoreSynchronizer(redisPubSub, groupService, userService, config);
    await semaphoreSynchronizer.sync();

    const messageHandler: MessageHandlerService = createMessageHandler(config, redisPubSub, userService, requestStatsService);
    const socketServer: SocketServer = createSocketServer(config, messageHandler.handleChatMessage);

    const nodeSynchronizer: NodeSynchronizer = createNodeSync(redisPubSub, socketServer);

    const app = createServer(chatRouter, roomRouter, getUserRouter(userService), getKeyExchangeRouter(keyExchangeService));

    await tryCreateDefaultChatroom();

    await runMessageCleanupJob(config);

    app.listen(config.serverPort, () => {
        console.log(`The chat server is running on port ${config.serverPort}!`);
    });
}

export {
    initZKChatServer
};