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
const STATUS_PENDING = 1;
const STATUS_CONFIRMED = 3;
const STATUS_EMERGENCY_OVERRIDE = 6;
const ESCROW_ACTIVE = 1;
const ESCROW_RELEASED = 2;

describe("Time-Delayed Transaction Processor", () => {
  it("initializes correctly", () => {
    expect(simnet.blockHeight).toBeDefined();
    
    const { result } = simnet.callReadOnlyFn(
      "time-delayed-transaction-processor",
      "get-system-stats",
      [],
      deployer
    );
    
    expect(result).toBeOk(
      expect.objectContaining({
        "total-transactions": expect.toBeUint(0),
        "total-escrow-amount": expect.toBeUint(0),
        "emergency-mode": expect.toBeBool(false),
        "next-transaction-id": expect.toBeUint(1)
      })
    );
  });

  it("initiates delayed transaction successfully", () => {
    const { result } = simnet.callPublicFn(
      "time-delayed-transaction-processor",
      "initiate-delayed-transaction",
      [
        wallet2,
        "u1000000", // 1M STX
        `u${EARTH}`,
        `u${MARS}`,
        `(some ${wallet1})`, // emergency contact
        `"Mars colony supply payment"`
      ],
      wallet1
    );
    
    expect(result).toBeOk(expect.toBeUint(1));
  });

  it("retrieves delayed transaction details", () => {
    // First initiate a transaction
    simnet.callPublicFn(
      "time-delayed-transaction-processor",
      "initiate-delayed-transaction",
      [
        wallet2,
        "u500000",
        `u${EARTH}`,
        `u${MOON}`,
        "none",
        `"Lunar mining equipment"`
      ],
      wallet1
    );
    
    const { result } = simnet.callReadOnlyFn(
      "time-delayed-transaction-processor",
      "get-delayed-transaction",
      ["u1"],
      deployer
    );
    
    expect(result).toBeSome(
      expect.objectContaining({
        "sender": expect.toBePrincipal(wallet1),
        "recipient": expect.toBePrincipal(wallet2),
        "amount": expect.toBeUint(500000),
        "origin-body": expect.toBeUint(EARTH),
        "destination-body": expect.toBeUint(MOON),
        "status": expect.toBeUint(STATUS_PENDING),
        "metadata": expect.toBeAscii("Lunar mining equipment")
      })
    );
  });

  it("rejects invalid transaction parameters", () => {
    // Test zero amount
    const { result: result1 } = simnet.callPublicFn(
      "time-delayed-transaction-processor",
      "initiate-delayed-transaction",
      [
        wallet2,
        "u0", // zero amount - invalid
        `u${EARTH}`,
        `u${MARS}`,
        "none",
        `"Invalid transaction"`
      ],
      wallet1
    );
    
    expect(result1).toBeErr(expect.toBeUint(202)); // err-invalid-parameters
    
    // Test same origin and destination
    const { result: result2 } = simnet.callPublicFn(
      "time-delayed-transaction-processor",
      "initiate-delayed-transaction",
      [
        wallet2,
        "u1000",
        `u${EARTH}`,
        `u${EARTH}`, // same as origin - invalid
        "none",
        `"Invalid transaction"`
      ],
      wallet1
    );
    
    expect(result2).toBeErr(expect.toBeUint(202)); // err-invalid-parameters
  });

  it("confirms delayed transaction by recipient", () => {
    // First initiate a transaction
    simnet.callPublicFn(
      "time-delayed-transaction-processor",
      "initiate-delayed-transaction",
      [
        wallet2,
        "u750000",
        `u${EARTH}`,
        `u${MARS}`,
        "none",
        `"Scientific equipment"`
      ],
      wallet1
    );
    
    // Advance time to allow confirmation (simulate communication delay)
    simnet.mineEmptyBlocks(10);
    
    const { result } = simnet.callPublicFn(
      "time-delayed-transaction-processor",
      "confirm-delayed-transaction",
      ["u1"],
      wallet2
    );
    
    expect(result).toBeOk(expect.toBeBool(true));
    
    // Verify transaction status was updated
    const { result: txResult } = simnet.callReadOnlyFn(
      "time-delayed-transaction-processor",
      "get-delayed-transaction",
      ["u1"],
      deployer
    );
    
    expect(txResult).toBeSome(
      expect.objectContaining({
        "status": expect.toBeUint(STATUS_CONFIRMED)
      })
    );
  });

  it("rejects transaction confirmation by wrong recipient", () => {
    // First initiate a transaction
    simnet.callPublicFn(
      "time-delayed-transaction-processor",
      "initiate-delayed-transaction",
      [
        wallet2,
        "u250000",
        `u${EARTH}`,
        `u${MARS}`,
        "none",
        `"Mars rover parts"`
      ],
      wallet1
    );
    
    simnet.mineEmptyBlocks(10);
    
    // Try to confirm with wallet1 (sender, not recipient)
    const { result } = simnet.callPublicFn(
      "time-delayed-transaction-processor",
      "confirm-delayed-transaction",
      ["u1"],
      wallet1
    );
    
    expect(result).toBeErr(expect.toBeUint(203)); // err-unauthorized
  });

  it("creates escrow account successfully", () => {
    const currentTime = simnet.burnBlockHeight * 600;
    const releaseTime = currentTime + 86400 * 90; // 90 days
    
    const { result } = simnet.callPublicFn(
      "time-delayed-transaction-processor",
      "create-escrow",
      [
        wallet2,
        "u5000000", // 5M STX
        `u${releaseTime}`,
        `(list "Mission completion" "Safety inspection" "Documentation")`,
        "(some u123)", // mission ID
        `(list u1 u2 u3)`, // milestone requirements
        "true" // early release allowed
      ],
      wallet1
    );
    
    expect(result).toBeOk(expect.toBeUint(1));
  });

  it("retrieves escrow account details", () => {
    const currentTime = simnet.burnBlockHeight * 600;
    const releaseTime = currentTime + 86400 * 60; // 60 days
    
    // Create escrow first
    simnet.callPublicFn(
      "time-delayed-transaction-processor",
      "create-escrow",
      [
        wallet2,
        "u2000000",
        `u${releaseTime}`,
        `(list "Phase 1" "Phase 2")`,
        "none",
        `(list)`,
        "false"
      ],
      wallet1
    );
    
    const { result } = simnet.callReadOnlyFn(
      "time-delayed-transaction-processor",
      "get-escrow-account",
      ["u1"],
      deployer
    );
    
    expect(result).toBeSome(
      expect.objectContaining({
        "depositor": expect.toBePrincipal(wallet1),
        "beneficiary": expect.toBePrincipal(wallet2),
        "amount": expect.toBeUint(2000000),
        "release-time": expect.toBeUint(releaseTime),
        "early-release-allowed": expect.toBeBool(false),
        "status": expect.toBeUint(ESCROW_ACTIVE)
      })
    );
  });

  it("rejects invalid escrow parameters", () => {
    const currentTime = simnet.burnBlockHeight * 600;
    
    // Test zero amount
    const { result: result1 } = simnet.callPublicFn(
      "time-delayed-transaction-processor",
      "create-escrow",
      [
        wallet2,
        "u0", // zero amount - invalid
        `u${currentTime + 86400}`,
        `(list "Condition1")`,
        "none",
        `(list)`,
        "false"
      ],
      wallet1
    );
    
    expect(result1).toBeErr(expect.toBeUint(202)); // err-invalid-parameters
    
    // Test past release time
    const { result: result2 } = simnet.callPublicFn(
      "time-delayed-transaction-processor",
      "create-escrow",
      [
        wallet2,
        "u1000000",
        `u${currentTime - 1000}`, // past time - invalid
        `(list "Condition1")`,
        "none",
        `(list)`,
        "false"
      ],
      wallet1
    );
    
    expect(result2).toBeErr(expect.toBeUint(202)); // err-invalid-parameters
  });

  it("releases escrow by depositor with early release", () => {
    const currentTime = simnet.burnBlockHeight * 600;
    const releaseTime = currentTime + 86400 * 30; // 30 days
    
    // Create escrow with early release allowed
    simnet.callPublicFn(
      "time-delayed-transaction-processor",
      "create-escrow",
      [
        wallet2,
        "u1500000",
        `u${releaseTime}`,
        `(list "Early completion")`,
        "none",
        `(list)`,
        "true" // early release allowed
      ],
      wallet1
    );
    
    // Release early by depositor
    const { result } = simnet.callPublicFn(
      "time-delayed-transaction-processor",
      "release-escrow",
      ["u1"],
      wallet1
    );
    
    expect(result).toBeOk(expect.toBeBool(true));
    
    // Verify escrow status
    const { result: escrowResult } = simnet.callReadOnlyFn(
      "time-delayed-transaction-processor",
      "get-escrow-account",
      ["u1"],
      deployer
    );
    
    expect(escrowResult).toBeSome(
      expect.objectContaining({
        "status": expect.toBeUint(ESCROW_RELEASED)
      })
    );
  });

  it("applies time dilation compensation", () => {
    // First create a transaction
    simnet.callPublicFn(
      "time-delayed-transaction-processor",
      "initiate-delayed-transaction",
      [
        wallet2,
        "u1000000",
        `u${EARTH}`,
        `u${JUPITER}`,
        "none",
        `"Jupiter mission"`
      ],
      wallet1
    );
    
    const { result } = simnet.callPublicFn(
      "time-delayed-transaction-processor",
      "apply-time-compensation",
      [
        "u1", // transaction ID
        "u50", // velocity factor (0.05% of light speed)
        "u100", // gravitational factor
        "u31536000" // 1 year mission duration
      ],
      wallet1
    );
    
    expect(result).toBeOk(expect.toBeUint(1)); // compensation ID
    
    // Verify compensation record
    const { result: compensationResult } = simnet.callReadOnlyFn(
      "time-delayed-transaction-processor",
      "get-time-compensation",
      ["u1"],
      deployer
    );
    
    expect(compensationResult).toBeSome(
      expect.objectContaining({
        "reference-frame": expect.toBeUint(EARTH),
        "velocity-factor": expect.toBeUint(50),
        "gravitational-factor": expect.toBeUint(100),
        "mission-duration": expect.toBeUint(31536000),
        "applied-to-transaction": expect.toBeUint(1),
        "calculated-by": expect.toBePrincipal(wallet1),
        "verified": expect.toBeBool(false)
      })
    );
  });

  it("creates emergency override by owner", () => {
    // First create a transaction
    simnet.callPublicFn(
      "time-delayed-transaction-processor",
      "initiate-delayed-transaction",
      [
        wallet2,
        "u800000",
        `u${EARTH}`,
        `u${MARS}`,
        "none",
        `"Emergency situation"`
      ],
      wallet1
    );
    
    const currentTime = simnet.burnBlockHeight * 600;
    const expirationTime = currentTime + 86400; // 24 hours
    
    const { result } = simnet.callPublicFn(
      "time-delayed-transaction-processor",
      "create-emergency-override",
      [
        "u1", // target transaction
        `"Communication lost with Mars station"`,
        "u1", // override type: force complete
        "none", // no new recipient
        `u${expirationTime}`
      ],
      deployer // contract owner
    );
    
    expect(result).toBeOk(expect.toBeUint(1));
    
    // Verify override record
    const { result: overrideResult } = simnet.callReadOnlyFn(
      "time-delayed-transaction-processor",
      "get-emergency-override",
      ["u1"],
      deployer
    );
    
    expect(overrideResult).toBeSome(
      expect.objectContaining({
        "authorized-by": expect.toBePrincipal(deployer),
        "target-transaction": expect.toBeUint(1),
        "override-type": expect.toBeUint(1),
        "executed": expect.toBeBool(false)
      })
    );
  });

  it("executes emergency override", () => {
    // Create transaction and override
    simnet.callPublicFn(
      "time-delayed-transaction-processor",
      "initiate-delayed-transaction",
      [
        wallet2,
        "u600000",
        `u${EARTH}`,
        `u${MARS}`,
        "none",
        `"Critical supply mission"`
      ],
      wallet1
    );
    
    const currentTime = simnet.burnBlockHeight * 600;
    const expirationTime = currentTime + 86400;
    
    simnet.callPublicFn(
      "time-delayed-transaction-processor",
      "create-emergency-override",
      [
        "u1",
        `"Life support emergency"`,
        "u2", // refund type
        "none",
        `u${expirationTime}`
      ],
      deployer
    );
    
    // Execute the override
    const { result } = simnet.callPublicFn(
      "time-delayed-transaction-processor",
      "execute-emergency-override",
      ["u1"],
      deployer
    );
    
    expect(result).toBeOk(expect.toBeBool(true));
    
    // Verify transaction status changed
    const { result: txResult } = simnet.callReadOnlyFn(
      "time-delayed-transaction-processor",
      "get-delayed-transaction",
      ["u1"],
      deployer
    );
    
    expect(txResult).toBeSome(
      expect.objectContaining({
        "status": expect.toBeUint(STATUS_EMERGENCY_OVERRIDE)
      })
    );
  });

  it("rejects emergency override by non-owner", () => {
    // Create transaction first
    simnet.callPublicFn(
      "time-delayed-transaction-processor",
      "initiate-delayed-transaction",
      [
        wallet2,
        "u400000",
        `u${EARTH}`,
        `u${MARS}`,
        "none",
        `"Regular mission"`
      ],
      wallet1
    );
    
    const currentTime = simnet.burnBlockHeight * 600;
    const expirationTime = currentTime + 86400;
    
    // Try to create override with non-owner
    const { result } = simnet.callPublicFn(
      "time-delayed-transaction-processor",
      "create-emergency-override",
      [
        "u1",
        `"Unauthorized override attempt"`,
        "u1",
        "none",
        `u${expirationTime}`
      ],
      wallet1 // not the owner
    );
    
    expect(result).toBeErr(expect.toBeUint(200)); // err-owner-only
  });

  it("updates communication delay by owner", () => {
    const { result } = simnet.callPublicFn(
      "time-delayed-transaction-processor",
      "update-communication-delay",
      [
        `u${EARTH}`,
        `u${JUPITER}`,
        "u2400", // 40 minutes
        "u150" // orbital position factor
      ],
      deployer
    );
    
    expect(result).toBeOk(expect.toBeUint(1));
    
    // Verify delay record
    const { result: delayResult } = simnet.callReadOnlyFn(
      "time-delayed-transaction-processor",
      "get-communication-delay",
      ["u1"],
      deployer
    );
    
    expect(delayResult).toBeSome(
      expect.objectContaining({
        "origin": expect.toBeUint(EARTH),
        "destination": expect.toBeUint(JUPITER),
        "current-delay": expect.toBeUint(2400),
        "orbital-position-factor": expect.toBeUint(150)
      })
    );
  });

  it("checks transaction ready status", () => {
    // Create a transaction
    simnet.callPublicFn(
      "time-delayed-transaction-processor",
      "initiate-delayed-transaction",
      [
        wallet2,
        "u300000",
        `u${EARTH}`,
        `u${MOON}`,
        "none",
        `"Quick lunar delivery"`
      ],
      wallet1
    );
    
    // Initially should not be ready (just created)
    const { result: result1 } = simnet.callReadOnlyFn(
      "time-delayed-transaction-processor",
      "check-transaction-ready",
      ["u1"],
      deployer
    );
    
    expect(result1).toBeBool(false);
    
    // Advance time and check again
    simnet.mineEmptyBlocks(5);
    
    const { result: result2 } = simnet.callReadOnlyFn(
      "time-delayed-transaction-processor",
      "check-transaction-ready",
      ["u1"],
      deployer
    );
    
    expect(result2).toBeBool(true);
  });

  it("tracks system statistics correctly", () => {
    // Create multiple transactions and escrows
    for (let i = 0; i < 3; i++) {
      simnet.callPublicFn(
        "time-delayed-transaction-processor",
        "initiate-delayed-transaction",
        [
          wallet2,
          "u100000",
          `u${EARTH}`,
          `u${MARS}`,
          "none",
          `"Transaction ${i + 1}"`
        ],
        wallet1
      );
    }
    
    const currentTime = simnet.burnBlockHeight * 600;
    simnet.callPublicFn(
      "time-delayed-transaction-processor",
      "create-escrow",
      [
        wallet2,
        "u5000000",
        `u${currentTime + 86400}`,
        `(list "Test")`,
        "none",
        `(list)`,
        "false"
      ],
      wallet1
    );
    
    const { result } = simnet.callReadOnlyFn(
      "time-delayed-transaction-processor",
      "get-system-stats",
      [],
      deployer
    );
    
    expect(result).toBeOk(
      expect.objectContaining({
        "total-transactions": expect.toBeUint(3),
        "total-escrow-amount": expect.toBeUint(5000000),
        "next-transaction-id": expect.toBeUint(4),
        "next-escrow-id": expect.toBeUint(2)
      })
    );
  });
});
