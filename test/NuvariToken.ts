import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseEther } from "viem";
import { network } from "hardhat";

describe("NuvariToken", async function () {
  const { viem } = await network.create();
  const [admin, user] = await viem.getWalletClients();
  const cap = parseEther("1000");

  async function deployToken() {
    return viem.deployContract("NuvariToken", ["Nuvari Token", "NVR", cap, parseEther("100")]);
  }

  it("mints the initial supply and enforces the cap", async function () {
    const token = await deployToken();
    assert.equal(await token.read.totalSupply(), parseEther("100"));
    await token.write.mint([user.account.address, parseEther("900")]);
    assert.equal(await token.read.totalSupply(), cap);
    await viem.assertions.revertWithCustomErrorWithArgs(
      token.write.mint([user.account.address, 1n]),
      token,
      "ERC20ExceededCap",
      [cap + 1n, cap],
    );
  });

  it("rejects minting from an address without MINTER_ROLE", async function () {
    const token = await deployToken();
    const minterRole = await token.read.MINTER_ROLE();
    await viem.assertions.revertWithCustomErrorWithArgs(
      token.write.mint([user.account.address, 1n], { account: user.account }),
      token,
      "AccessControlUnauthorizedAccount",
      [user.account.address, minterRole],
    );
    assert.equal(await token.read.balanceOf([admin.account.address]), parseEther("100"));
  });
});