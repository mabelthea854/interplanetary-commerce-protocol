import { describe, expect, it } from "vitest";

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const wallet1 = accounts.get("wallet_1")!;
const wallet2 = accounts.get("wallet_2")!;

// Constants matching the contract
const EARTH = 1;
const MOON = 2;
const MARS = 3;
const JUPITER = 4;
const STATUS_PLANNED = 1;
const STATUS_LAUNCHED = 2;
const STATUS_COMPLETED = 5;

describe("Orbital Logistics Coordinator", () => {
  it("initializes correctly", () => {
    expect(simnet.blockHeight).toBeDefined();
    
    const { result } = simnet.callReadOnlyFn(
      "orbital-logistics-coordinator",
      "get-system-stats",
      [],
      deployer
    );
    
    expect(result).toBeOk(
      expect.objectContaining({
        "total-cargo-processed": expect.toBeUint(0),
        "next-cargo-id": expect.toBeUint(1),
        "next-window-id": expect.toBeUint(1),
        "next-route-id": expect.toBeUint(1)
      })
    );
  });

  it("registers a cargo manifest successfully", () => {
    const { result } = simnet.callPublicFn(
      "orbital-logistics-coordinator",
      "register-cargo-manifest",
      [
        `u${EARTH}`,
        `u${MARS}`,
        `"Medical Supplies"`,
        "u5000", // 5 tons
        "u50",   // 50 cubic meters
        "u1",    // priority 1 (high)
        "true"   // quarantine required
      ],
      wallet1
    );
    
    expect(result).toBeOk(expect.toBeUint(1));
  });

  it("retrieves cargo manifest details", () => {
    // First register a cargo manifest
    simnet.callPublicFn(
      "orbital-logistics-coordinator",
      "register-cargo-manifest",
      [
        `u${EARTH}`,
        `u${MOON}`,
        `"Construction Materials"`,
        "u10000", // 10 tons
        "u100",   // 100 cubic meters
        "u2",     // priority 2
        "false"   // no quarantine
      ],
      wallet1
    );
    
    const { result } = simnet.callReadOnlyFn(
      "orbital-logistics-coordinator",
      "get-cargo-manifest",
      ["u1"],
      deployer
    );
    
    expect(result).toBeSome(
      expect.objectContaining({
        "origin": expect.toBeUint(EARTH),
        "destination": expect.toBeUint(MOON),
        "cargo-type": expect.toBeAscii("Construction Materials"),
        "mass-kg": expect.toBeUint(10000),
        "volume-m3": expect.toBeUint(100),
        "priority": expect.toBeUint(2),
        "owner": expect.toBePrincipal(wallet1),
        "status": expect.toBeUint(STATUS_PLANNED),
        "quarantine-required": expect.toBeBool(false)
      })
    );
  });

  it("rejects invalid cargo parameters", () => {
    // Test zero mass
    const { result: result1 } = simnet.callPublicFn(
      "orbital-logistics-coordinator",
      "register-cargo-manifest",
      [
        `u${EARTH}`,
        `u${MARS}`,
        `"Invalid Cargo"`,
        "u0", // zero mass - invalid
        "u50",
        "u1",
        "false"
      ],
      wallet1
    );
    
    expect(result1).toBeErr(expect.toBeUint(102)); // err-invalid-parameters
    
    // Test same origin and destination
    const { result: result2 } = simnet.callPublicFn(
      "orbital-logistics-coordinator",
      "register-cargo-manifest",
      [
        `u${EARTH}`,
        `u${EARTH}`, // same as origin - invalid
        `"Invalid Cargo"`,
        "u1000",
        "u10",
        "u1",
        "false"
      ],
      wallet1
    );
    
    expect(result2).toBeErr(expect.toBeUint(102)); // err-invalid-parameters
  });

  it("creates a launch window successfully", () => {
    const currentTime = simnet.burnBlockHeight * 600; // approximate timestamp
    const futureTime = currentTime + 86400; // +1 day
    const windowEnd = futureTime + 86400; // +2 days total
    
    const { result } = simnet.callPublicFn(
      "orbital-logistics-coordinator",
      "create-launch-window",
      [
        `u${EARTH}`,
        `u${MARS}`,
        `u${futureTime}`,
        `u${windowEnd}`,
        `(list u${JUPITER})` // gravity assist via Jupiter
      ],
      wallet1
    );
    
    expect(result).toBeOk(expect.toBeUint(1));
  });

  it("retrieves launch window details", () => {
    const currentTime = simnet.burnBlockHeight * 600;
    const futureTime = currentTime + 86400;
    const windowEnd = futureTime + 86400;
    
    // Create launch window first
    simnet.callPublicFn(
      "orbital-logistics-coordinator",
      "create-launch-window",
      [
        `u${EARTH}`,
        `u${MARS}`,
        `u${futureTime}`,
        `u${windowEnd}`,
        `(list u${JUPITER})`
      ],
      wallet1
    );
    
    const { result } = simnet.callReadOnlyFn(
      "orbital-logistics-coordinator",
      "get-launch-window",
      ["u1"],
      deployer
    );
    
    expect(result).toBeSome(
      expect.objectContaining({
        "origin": expect.toBeUint(EARTH),
        "destination": expect.toBeUint(MARS),
        "window-start": expect.toBeUint(futureTime),
        "window-end": expect.toBeUint(windowEnd),
        "created-by": expect.toBePrincipal(wallet1)
      })
    );
  });

  it("updates cargo status by owner", () => {
    // Register cargo first
    simnet.callPublicFn(
      "orbital-logistics-coordinator",
      "register-cargo-manifest",
      [
        `u${EARTH}`,
        `u${MARS}`,
        `"Test Cargo"`,
        "u1000",
        "u10",
        "u1",
        "false"
      ],
      wallet1
    );
    
    // Update status to launched
    const { result } = simnet.callPublicFn(
      "orbital-logistics-coordinator",
      "update-cargo-status",
      ["u1", `u${STATUS_LAUNCHED}`],
      wallet1
    );
    
    expect(result).toBeOk(expect.toBeBool(true));
    
    // Verify the status was updated
    const { result: cargoResult } = simnet.callReadOnlyFn(
      "orbital-logistics-coordinator",
      "get-cargo-manifest",
      ["u1"],
      deployer
    );
    
    expect(cargoResult).toBeSome(
      expect.objectContaining({
        "status": expect.toBeUint(STATUS_LAUNCHED)
      })
    );
  });

  it("rejects cargo status update by non-owner", () => {
    // Register cargo with wallet1
    simnet.callPublicFn(
      "orbital-logistics-coordinator",
      "register-cargo-manifest",
      [
        `u${EARTH}`,
        `u${MARS}`,
        `"Test Cargo"`,
        "u1000",
        "u10",
        "u1",
        "false"
      ],
      wallet1
    );
    
    // Try to update status with wallet2 (should fail)
    const { result } = simnet.callPublicFn(
      "orbital-logistics-coordinator",
      "update-cargo-status",
      ["u1", `u${STATUS_LAUNCHED}`],
      wallet2
    );
    
    expect(result).toBeErr(expect.toBeUint(106)); // err-unauthorized
  });

  it("processes customs clearance by owner", () => {
    // Register cargo first
    simnet.callPublicFn(
      "orbital-logistics-coordinator",
      "register-cargo-manifest",
      [
        `u${EARTH}`,
        `u${MARS}`,
        `"Quarantine Cargo"`,
        "u2000",
        "u20",
        "u1",
        "true"
      ],
      wallet1
    );
    
    // Process customs clearance (deployer is contract owner)
    const { result } = simnet.callPublicFn(
      "orbital-logistics-coordinator",
      "process-customs-clearance",
      [
        "u1",
        "u7", // 7 days quarantine
        `"Cleared after inspection"`
      ],
      deployer
    );
    
    expect(result).toBeOk(expect.toBeBool(true));
    
    // Verify customs record was created
    const { result: customsResult } = simnet.callReadOnlyFn(
      "orbital-logistics-coordinator",
      "get-customs-record",
      ["u1"],
      deployer
    );
    
    expect(customsResult).toBeSome(
      expect.objectContaining({
        "quarantine-days": expect.toBeUint(7),
        "approved": expect.toBeBool(true),
        "inspector": expect.toBePrincipal(deployer)
      })
    );
  });

  it("registers logistics provider", () => {
    const { result } = simnet.callPublicFn(
      "orbital-logistics-coordinator",
      "register-logistics-provider",
      [
        `"SpaceX Interplanetary"`,
        `(list u${EARTH} u${MARS} u${MOON})`, // capabilities
        "u1000000" // staked tokens
      ],
      wallet1
    );
    
    expect(result).toBeOk(expect.toBeBool(true));
    
    // Verify provider was registered
    const { result: providerResult } = simnet.callReadOnlyFn(
      "orbital-logistics-coordinator",
      "get-logistics-provider",
      [wallet1],
      deployer
    );
    
    expect(providerResult).toBeSome(
      expect.objectContaining({
        "name": expect.toBeAscii("SpaceX Interplanetary"),
        "staked-tokens": expect.toBeUint(1000000),
        "reputation-score": expect.toBeUint(100),
        "active": expect.toBeBool(true)
      })
    );
  });

  it("creates supply route", () => {
    const nextAvailable = simnet.burnBlockHeight * 600 + 86400;
    
    const { result } = simnet.callPublicFn(
      "orbital-logistics-coordinator",
      "create-supply-route",
      [
        `u${EARTH}`,
        `u${MARS}`,
        `"Express Cargo"`,
        "u500000", // base cost
        "u50000",  // 50 ton capacity
        `u${nextAvailable}`
      ],
      wallet1
    );
    
    expect(result).toBeOk(expect.toBeUint(1));
    
    // Verify route was created
    const { result: routeResult } = simnet.callReadOnlyFn(
      "orbital-logistics-coordinator",
      "get-supply-route",
      ["u1"],
      deployer
    );
    
    expect(routeResult).toBeSome(
      expect.objectContaining({
        "origin": expect.toBeUint(EARTH),
        "destination": expect.toBeUint(MARS),
        "route-type": expect.toBeAscii("Express Cargo"),
        "base-cost": expect.toBeUint(500000),
        "cargo-capacity": expect.toBeUint(50000),
        "operator": expect.toBePrincipal(wallet1),
        "active": expect.toBeBool(true)
      })
    );
  });

  it("tracks system statistics correctly", () => {
    // Register multiple cargo manifests
    for (let i = 0; i < 3; i++) {
      simnet.callPublicFn(
        "orbital-logistics-coordinator",
        "register-cargo-manifest",
        [
          `u${EARTH}`,
          `u${MARS}`,
          `"Cargo ${i + 1}"`,
          "u1000",
          "u10",
          "u1",
          "false"
        ],
        wallet1
      );
    }
    
    const { result } = simnet.callReadOnlyFn(
      "orbital-logistics-coordinator",
      "get-system-stats",
      [],
      deployer
    );
    
    expect(result).toBeOk(
      expect.objectContaining({
        "total-cargo-processed": expect.toBeUint(3),
        "next-cargo-id": expect.toBeUint(4)
      })
    );
  });
});
