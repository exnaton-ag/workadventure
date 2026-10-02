import { EventEmitter } from "events";
import { afterEach, describe, expect, it, vi } from "vitest";
import { get, writable } from "svelte/store";
import type * as SvelteStores from "svelte/store";
import type { LocalStreamStoreValue } from "../../../src/front/Stores/MediaStore";
import type { SpaceInterface } from "../../../src/front/Space/SpaceInterface";
import { RemotePeer } from "../../../src/front/WebRtc/RemotePeer";

// Exercise RemotePeer's real status handling without opening browser connections.
vi.mock("simple-peer/simplepeer.min.js", () => ({
    default: class extends EventEmitter {
        public _connected = false;
        public destroyed = false;

        get connected() {
            return this._connected;
        }

        write() {
            return true;
        }

        destroy() {
            this.destroyed = true;
        }
    },
}));
// Factories are hoisted before static imports; resolve their real stores through Vitest.
vi.mock("../../../src/front/Stores/MediaStore", async () => {
    const { writable } = await vi.importActual<typeof SvelteStores>("svelte/store");
    return { videoBandwidthStore: writable("unlimited") };
});
vi.mock("../../../src/front/Components/Video/utils", () => ({
    getIceServersConfig: () => [],
    getSdpTransform: () => undefined,
}));
vi.mock("../../../src/front/Phaser/Components/SoundMeter", () => ({ SoundMeter: vi.fn() }));
vi.mock("../../../src/front/Utils/E2EHooks", () => ({
    incrementWebRtcConnectionsCount: vi.fn(),
    decrementWebRtcConnectionsCount: vi.fn(),
}));

const peers: RemotePeer[] = [];

function createPeer(): RemotePeer {
    const space = {
        getSpaceUserBySpaceUserId: () => undefined,
        isStreamingStore: writable(true),
    } as unknown as SpaceInterface;
    const peer = new RemotePeer(
        { userId: "remote-user" },
        false,
        space,
        false,
        writable<LocalStreamStoreValue>({ type: "success", stream: undefined }),
        "video",
        "remote-user",
        writable(new Set<string>()),
        vi.fn(),
        writable({ video: false, audio: false })
    );
    peers.push(peer);
    return peer;
}

/** A gathering timeout must not replace a usable call's status with an error. */
describe("RemotePeer ICE gathering timeout", () => {
    afterEach(() => {
        peers.splice(0).forEach((peer) => peer.destroy());
        vi.restoreAllMocks();
    });

    it("keeps an established call connected without masking a later connection failure", () => {
        const peer = createPeer();
        peer.emit("connect");
        expect(get(peer.statusStore)).toBe("connected");

        peer.emit("iceTimeout");
        expect(get(peer.statusStore)).toBe("connected");

        vi.spyOn(console, "error").mockImplementation(() => undefined);
        peer.emit("error", new Error("Connection failed"));
        expect(get(peer.statusStore)).toBe("error");
    });

    it("reports a gathering timeout when the call has not connected", () => {
        const peer = createPeer();

        peer.emit("iceTimeout");

        expect(get(peer.statusStore)).toBe("error");
    });
});
