import { CompanionCollectionList } from "@workadventure/messages";
import type { CompanionServiceInterface } from "./CompanionServiceInterface";
import { COMPANION_RESOURCES } from "../../front/Phaser/Companion/CompanionTextures";

/**
 * Companion Service list that the default list of companions
 */
export class LocalCompanionSevice implements CompanionServiceInterface {
    async getCompanionList(roomUrl: string, token: string): Promise<CompanionCollectionList | undefined> {
        const defaultCompanionList: CompanionCollectionList = await require("../data/companions.json");
        if (COMPANION_RESOURCES.length && defaultCompanionList[0]) {
            defaultCompanionList[0].textures =  COMPANION_RESOURCES;
        }
        return Promise.resolve(defaultCompanionList);
    }
}
