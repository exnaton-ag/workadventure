import { EventEmitter } from "events";
import { afterEach, describe, expect, it, vi } from "vitest";
import { get, writable } from "svelte/store";
import type * as SvelteStores from "svelte/store";

// Drive peer events without opening a browser connection; keep RemotePeer's status handling real.
vi.mock("@workadventure/simple-peer", () => ({
    default: class extends EventEmitter {
        public _connected = false;
        public destroyed = false;
        public readonly _pc = { getSenders: () => [] };

        get connected() {
            return this._connected;
        }

        destroy() {
            this.destroyed = true;
        }
    },
}));
// Mock factories are hoisted before static imports, so resolve their real stores through Vitest.
vi.mock("../../../src/front/Stores/MediaStore", async () => {
    const { writable } = await vi.importActual<typeof SvelteStores>("svelte/store");
    return { videoQualityStore: writable("recommended") };
});
vi.mock("../../../src/front/Stores/PeerStore", async () => {
    const { writable } = await vi.importActual<typeof SvelteStores>("svelte/store");
    return { volumeProximityDiscussionStore: writable(1) };
});
vi.mock("../../../src/front/Stores/ScreenSharingStore", async () => {
    const { writable } = await vi.importActual<typeof SvelteStores>("svelte/store");
    return { screenShareQualityStore: writable("recommended") };
});
vi.mock("../../../src/front/Stores/BandwidthConstrainedPreferenceStore", async () => {
    const { writable } = await vi.importActual<typeof SvelteStores>("svelte/store");
    return { bandwidthConstrainedPreferenceStore: writable("balanced") };
});
vi.mock("../../../src/front/Phaser/Components/SoundMeter", () => ({ SoundMeter: vi.fn() }));
vi.mock("../../../src/front/Utils/E2EHooks", () => ({
    incrementWebRtcConnectionsCount: vi.fn(),
    decrementWebRtcConnectionsCount: vi.fn(),
}));
vi.mock("../../../src/front/WebRtc/VideoQualityAnalytics", () => ({
    subscribeToOutboundVideoQualityAnalytics: () => () => undefined,
    subscribeToVideoQualityAnalytics: () => () => undefined,
}));
vi.mock("../../../src/front/WebRtc/WebRtcStatsFactory", async () => {
    const { writable } = await vi.importActual<typeof SvelteStores>("svelte/store");
    return {
        createPeerWebRtcStats: () => ({ receiver: writable(undefined), sender: writable(undefined) }),
    };
});
vi.mock("../../../src/front/WebRtc/LocalEncoderStats", () => ({
    registerLocalEncoderStats: () => () => undefined,
}));

import { RemotePeer } from "../../../src/front/WebRtc/RemotePeer";
import type { SpaceInterface } from "../../../src/front/Space/SpaceInterface";

const peers: RemotePeer[] = [];

function createPeer(): RemotePeer {
    const space = {
        getSpaceUserBySpaceUserId: () => undefined,
        getName: () => "test-space",
        isStreamingVideoStore: writable(true),
    } as unknown as SpaceInterface;
    const peer = new RemotePeer(
        { userId: "remote-user" },
        false,
        space,
        [],
        false,
        writable(undefined),
        "video",
        "remote-user",
        writable(new Set<string>()),
        vi.fn(),
        "test-connection",
    );
    peers.push(peer);
    return peer;
}

/** Candidate gathering may time out after media and the data channel are already connected. */
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
