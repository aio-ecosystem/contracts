import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";

const DAY = 60 * 60 * 24;
const BNB_AMOUNT = ethers.BigNumber.from(9879879879879879877n);
const TO_DECIMALS = ethers.BigNumber.from(10 ** 9);
const TOTAL_SUPPLY = 12e6;
const PRESALE_PERIOD = 1; // days
const PRICE = 125e11;
const CLIFF_SHARE = 40;
const VESTING_SHARE = 20;

const MONTH = 30 * DAY;

async function deployFixture() {
	const AIO = await ethers.getContractFactory("AIOToken");
	const [admin, buyer, referral] = await ethers.getSigners();
	const aio = await AIO.deploy();
	await aio.deployed();

	console.log(await aio.totalSupply());

	const Presale = await ethers.getContractFactory("Presale");
	const presale = await Presale.deploy(aio.address, TOTAL_SUPPLY, await time.latest(), PRESALE_PERIOD, PRICE);
	await presale.deployed();
	return { aio, presale, admin, buyer, referral };
}

async function presaleWithTokensFixture() {
	const { aio, presale, admin, buyer, referral } = await deployFixture();

	await aio.transfer(presale.address, ethers.BigNumber.from(TOTAL_SUPPLY).mul(TO_DECIMALS));

	return { aio, presale, admin, buyer, referral };
}

describe("Presale referrals", () => {
	it("recieves precise share", async () => {
		const { presale, referral, buyer } = await loadFixture(presaleWithTokensFixture);

		const balanceSnapshot = await ethers.provider.getBalance(referral.address);

		await presale.connect(buyer)["buy(address)"](referral.address, { value: BNB_AMOUNT });

		const newBalance = await ethers.provider.getBalance(referral.address);

		expect(newBalance.sub(balanceSnapshot)).to.eq(BNB_AMOUNT.div(20));
	});
});

describe("Presale purchase", () => {
	it("buys", async () => {
		const { presale, buyer } = await loadFixture(presaleWithTokensFixture);

		const decimals = 1e9;
		const price = await presale.PRICE();
		const amountLeftSnapshot = await presale.amountLeft();

		const expectedTokens = BNB_AMOUNT.mul(decimals).div(price);

		await presale.connect(buyer)["buy()"]({ value: BNB_AMOUNT });

		expect((await presale.userVesting(buyer.address))[0])
			.to.eq(expectedTokens)
			.and.to.emit(presale, "Purchase");
		expect(amountLeftSnapshot.sub(await presale.amountLeft())).to.eq(expectedTokens);
	});

	it("not in time", async () => {
		const { presale, buyer } = await loadFixture(presaleWithTokensFixture);

		time.increase(DAY);

		await expect(presale.connect(buyer)["buy()"]({ value: BNB_AMOUNT })).to.be.revertedWith(
			"Presale: Presale is not active"
		);
	});

	it("out of supply", async () => {
		const { presale, buyer } = await loadFixture(presaleWithTokensFixture);

		const MAX_BNB_AMOUNT = ethers.BigNumber.from(150000000000000000000n);

		await presale.connect(buyer)["buy()"]({ value: MAX_BNB_AMOUNT });

		await expect(presale.connect(buyer)["buy()"]({ value: BNB_AMOUNT })).to.be.revertedWith("Presale: No tokens left");
	});

	it("calculates correctly on low supplies", async () => {
		const { presale, buyer } = await loadFixture(presaleWithTokensFixture);

		const BIG_BNB_AMOUNT = ethers.BigNumber.from(140000000000000000000n);

		await presale.connect(buyer)["buy()"]({ value: BIG_BNB_AMOUNT });

		const balanceSnapshot = await ethers.provider.getBalance(buyer.address);
		const amountLeftSnapshot = await presale.amountLeft();

		const trans = await presale.connect(buyer)["buy()"]({ value: BIG_BNB_AMOUNT });
		const resp = await trans.wait();

		const gas = resp.gasUsed.mul(resp.effectiveGasPrice);

		expect(await presale.amountLeft()).to.eq(0);
		const newBalance = await ethers.provider.getBalance(buyer.address);
		expect(balanceSnapshot.sub(newBalance).sub(gas)).to.eq(
			amountLeftSnapshot.mul(await presale.PRICE()).div(TO_DECIMALS)
		);
	});

	it("calculates correctly on low supplies with ref", async () => {
		const { presale, buyer, referral } = await loadFixture(presaleWithTokensFixture);

		const BIG_BNB_AMOUNT = ethers.BigNumber.from(140000000000000000000n);

		const refBalanceSnap = await ethers.provider.getBalance(referral.address);

		await presale.connect(buyer)["buy(address)"](referral.address, { value: BIG_BNB_AMOUNT });

		const balanceSnapshot = await ethers.provider.getBalance(buyer.address);
		const amountLeftSnapshot = await presale.amountLeft();

		const trans = await presale.connect(buyer)["buy(address)"](referral.address, { value: BIG_BNB_AMOUNT });
		const resp = await trans.wait();

		const gas = resp.gasUsed.mul(resp.effectiveGasPrice);

		const refBal = await ethers.provider.getBalance(referral.address);

		expect(await presale.amountLeft()).to.eq(0);
		const newBalance = await ethers.provider.getBalance(buyer.address);
		expect(balanceSnapshot.sub(newBalance).sub(gas)).to.eq(
			amountLeftSnapshot.mul(await presale.PRICE()).div(TO_DECIMALS)
		);

		expect(refBal.sub(refBalanceSnap)).to.eq(
			amountLeftSnapshot
				.mul(await presale.PRICE())
				.div(TO_DECIMALS)
				.div(20)
				.add(BIG_BNB_AMOUNT.div(20))
		);
	});

	it("throws on low funds", async () => {
		const { presale, buyer } = await loadFixture(presaleWithTokensFixture);

		const LOW_BNB_AMOUNT = ethers.BigNumber.from(12499); // max amount for revert

		await expect(presale.connect(buyer)["buy()"]({ value: LOW_BNB_AMOUNT })).to.be.revertedWith(
			"Presale: Insufficient funds"
		);
	});
});

async function endPresaleFixture() {
	const { aio, presale, admin, buyer, referral } = await presaleWithTokensFixture();

	await presale.connect(buyer)["buy()"]({ value: BNB_AMOUNT });

	const amount = (await presale.userVesting(buyer.address))[0];

	await time.increase(DAY);

	return { aio, presale, admin, buyer, referral, amount };
}

describe("Vesting", () => {
	it("unable to claim during presale", async () => {
		const { presale, buyer } = await loadFixture(deployFixture);

		await presale.connect(buyer)["buy()"]({ value: BNB_AMOUNT });

		expect(await presale.claimableAmount(buyer.address)).to.eq(0);

		await expect(presale.connect(buyer).claim()).to.be.revertedWith("Claim: no tokens to claim");
	});

	it("able to claim right after presale ends", async () => {
		const { presale, buyer, amount, aio } = await loadFixture(endPresaleFixture);

		expect(await presale.claimableAmount(buyer.address)).to.eq(amount.mul(CLIFF_SHARE).div(100));

		expect(await presale.connect(buyer).claim()).to.be.ok;

		expect(await aio.balanceOf(buyer.address)).to.eq(amount.mul(CLIFF_SHARE).div(100));
	});

	it("correct claim amount", async () => {
		const { presale, buyer, amount } = await loadFixture(endPresaleFixture);

		expect(await presale.claimableAmount(buyer.address)).to.eq(amount.mul(CLIFF_SHARE).div(100));

		await time.increase(MONTH);

		expect(await presale.claimableAmount(buyer.address)).to.eq(amount.mul(CLIFF_SHARE + VESTING_SHARE).div(100));

		await time.increase(MONTH);

		expect(await presale.claimableAmount(buyer.address)).to.eq(amount.mul(CLIFF_SHARE + 2 * VESTING_SHARE).div(100));

		await time.increase(MONTH);

		expect(await presale.claimableAmount(buyer.address)).to.eq(amount);

		await time.increase(MONTH);

		expect(await presale.claimableAmount(buyer.address)).to.eq(amount);
	});

	it("reverts when no tokens on contract", async () => {
		const { presale, buyer } = await loadFixture(deployFixture);

		await presale.connect(buyer)["buy()"]({ value: BNB_AMOUNT });

		await time.increase(31 * DAY);

		expect(await presale.tokenBalance()).to.eq(0);

		await expect(presale.connect(buyer).claim()).to.be.revertedWith("Claim: Not enough tokens in the contract");
	});

	it("changes vesting data", async () => {
		const { presale, buyer, amount } = await loadFixture(endPresaleFixture);

		await time.increase(2.5 * MONTH);

		const amtToClaim = await presale.claimableAmount(buyer.address);

		expect(amtToClaim).to.eq(amount.mul(CLIFF_SHARE + VESTING_SHARE * 2).div(100));

		await presale.connect(buyer).claim();

		expect((await presale.userVesting(buyer.address))[1]).to.eq(amtToClaim);
	});
});

describe("owner functions", () => {
	it("not accessible to ordinary account", async () => {
		const { presale, buyer } = await loadFixture(presaleWithTokensFixture);

		await expect(presale.connect(buyer).withdraw()).to.be.revertedWith("Ownable: caller is not the owner");
	});

	it("not withdrawable during presale period", async () => {
		const { presale } = await loadFixture(presaleWithTokensFixture);

		await expect(presale.withdraw()).to.be.revertedWith("Presale: Presale has not ended yet");
	});

	it("withdraws", async () => {
		const { presale, buyer, admin } = await loadFixture(presaleWithTokensFixture);

		await presale.connect(buyer)["buy()"]({ value: BNB_AMOUNT });

		const adminBalanceSnapshot = await ethers.provider.getBalance(admin.address);

		await time.increase(DAY);

		const tx = await presale.withdraw();
		const resp = await tx.wait();

		expect(
			(await ethers.provider.getBalance(admin.address))
				.sub(adminBalanceSnapshot)
				.add(resp.gasUsed.mul(resp.effectiveGasPrice))
		).to.eq(BNB_AMOUNT);

		expect(await ethers.provider.getBalance(presale.address)).to.eq(0);
	});

	it("withdraws with ref", async () => {
		const { presale, buyer, admin, referral } = await loadFixture(presaleWithTokensFixture);

		await presale.connect(buyer)["buy(address)"](referral.address, { value: BNB_AMOUNT });

		const adminBalanceSnapshot = await ethers.provider.getBalance(admin.address);

		await time.increase(DAY);

		const tx = await presale.withdraw();
		const resp = await tx.wait();

		expect(
			(await ethers.provider.getBalance(admin.address))
				.sub(adminBalanceSnapshot)
				.add(resp.gasUsed.mul(resp.effectiveGasPrice))
		).to.eq(BNB_AMOUNT.mul(19).div(20).add(1));

		expect(await ethers.provider.getBalance(presale.address)).to.eq(0);
	});
});

describe("End presale", () => {
	it("ends by owner", async () => {
		const { presale, buyer } = await loadFixture(deployFixture);
		await presale.endPresale();

		await time.increase(1);

		expect(await presale.endTime()).to.be.lessThan(await time.latest());

		await expect(presale.connect(buyer)["buy()"]({ value: BNB_AMOUNT })).to.be.revertedWith(
			"Presale: Presale is not active"
		);

		await presale.withdraw();
	});

	it("ends by out of supply", async () => {
		const { presale, buyer } = await loadFixture(deployFixture);

		const MAX_BNB_AMOUNT = ethers.BigNumber.from(148888888888888888888n);

		await presale.connect(buyer)["buy()"]({ value: MAX_BNB_AMOUNT });

		await presale.connect(buyer)["buy()"]({ value: MAX_BNB_AMOUNT });

		await time.increase(1);

		expect(await presale.endTime()).to.be.lessThan(await time.latest());

		await presale.withdraw();
	});
});
