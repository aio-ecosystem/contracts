// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

/**
 * @dev Interface of the ERC20 standard as defined in the EIP.
 */
interface IERC20 {
    /**
     * @dev Emitted when `value` tokens are moved from one account (`from`) to
     * another (`to`).
     *
     * Note that `value` may be zero.
     */
    event Transfer(address indexed from, address indexed to, uint256 value);

    /**
     * @dev Emitted when the allowance of a `spender` for an `owner` is set by
     * a call to {approve}. `value` is the new allowance.
     */
    event Approval(
        address indexed owner,
        address indexed spender,
        uint256 value
    );

    /**
     * @dev Returns the amount of tokens in existence.
     */
    function totalSupply() external view returns (uint256);

    /**
     * @dev Returns the amount of tokens owned by `account`.
     */
    function balanceOf(address account) external view returns (uint256);

    /**
     * @dev Moves `amount` tokens from the caller's account to `to`.
     *
     * Returns a boolean value indicating whether the operation succeeded.
     *
     * Emits a {Transfer} event.
     */
    function transfer(address to, uint256 amount) external returns (bool);

    /**
     * @dev Returns the remaining number of tokens that `spender` will be
     * allowed to spend on behalf of `owner` through {transferFrom}. This is
     * zero by default.
     *
     * This value changes when {approve} or {transferFrom} are called.
     */
    function allowance(
        address owner,
        address spender
    ) external view returns (uint256);

    /**
     * @dev Sets `amount` as the allowance of `spender` over the caller's tokens.
     *
     * Returns a boolean value indicating whether the operation succeeded.
     *
     * IMPORTANT: Beware that changing an allowance with this method brings the risk
     * that someone may use both the old and the new allowance by unfortunate
     * transaction ordering. One possible solution to mitigate this race
     * condition is to first reduce the spender's allowance to 0 and set the
     * desired value afterwards:
     * https://github.com/ethereum/EIPs/issues/20#issuecomment-263524729
     *
     * Emits an {Approval} event.
     */
    function approve(address spender, uint256 amount) external returns (bool);

    /**
     * @dev Moves `amount` tokens from `from` to `to` using the
     * allowance mechanism. `amount` is then deducted from the caller's
     * allowance.
     *
     * Returns a boolean value indicating whether the operation succeeded.
     *
     * Emits a {Transfer} event.
     */
    function transferFrom(
        address from,
        address to,
        uint256 amount
    ) external returns (bool);
}

interface IERC20Metadata is IERC20 {
    /**
     * @dev Returns the name of the token.
     */
    function name() external view returns (string memory);

    /**
     * @dev Returns the symbol of the token.
     */
    function symbol() external view returns (string memory);

    /**
     * @dev Returns the decimals places of the token.
     */
    function decimals() external view returns (uint8);
}

/**
 * @dev Provides information about the current execution context, including the
 * sender of the transaction and its data. While these are generally available
 * via msg.sender and msg.data, they should not be accessed in such a direct
 * manner, since when dealing with meta-transactions the account sending and
 * paying for execution may not be the actual sender (as far as an application
 * is concerned).
 *
 * This contract is only required for intermediate, library-like contracts.
 */
abstract contract Context {
    function _msgSender() internal view virtual returns (address) {
        return msg.sender;
    }
}

/**
 * @dev Contract module which provides a basic access control mechanism, where
 * there is an account (an owner) that can be granted exclusive access to
 * specific functions.
 *
 * By default, the owner account will be the one that deploys the contract. This
 * can later be changed with {transferOwnership}.
 *
 * This module is used through inheritance. It will make available the modifier
 * `onlyOwner`, which can be applied to your functions to restrict their use to
 * the owner.
 */
abstract contract Ownable is Context {
    address private _owner;

    event OwnershipTransferred(
        address indexed previousOwner,
        address indexed newOwner
    );

    /**
     * @dev Initializes the contract setting the deployer as the initial owner.
     */
    constructor() {
        _transferOwnership(_msgSender());
    }

    /**
     * @dev Throws if called by any account other than the owner.
     */
    modifier onlyOwner() {
        _checkOwner();
        _;
    }

    /**
     * @dev Returns the address of the current owner.
     */
    function owner() public view virtual returns (address) {
        return _owner;
    }

    /**
     * @dev Throws if the sender is not the owner.
     */
    function _checkOwner() internal view virtual {
        require(owner() == _msgSender(), "Ownable: caller is not the owner");
    }

    /**
     * @dev Leaves the contract without owner. It will not be possible to call
     * `onlyOwner` functions. Can only be called by the current owner.
     *
     * NOTE: Renouncing ownership will leave the contract without an owner,
     * thereby disabling any functionality that is only available to the owner.
     */
    function renounceOwnership() public virtual onlyOwner {
        _transferOwnership(address(0));
    }

    /**
     * @dev Transfers ownership of the contract to a new account (`newOwner`).
     * Can only be called by the current owner.
     */
    function transferOwnership(address newOwner) public virtual onlyOwner {
        require(
            newOwner != address(0),
            "Ownable: new owner is the zero address"
        );
        _transferOwnership(newOwner);
    }

    /**
     * @dev Transfers ownership of the contract to a new account (`newOwner`).
     * Internal function without access restriction.
     */
    function _transferOwnership(address newOwner) internal virtual {
        address oldOwner = _owner;
        _owner = newOwner;
        emit OwnershipTransferred(oldOwner, newOwner);
    }
}

/**
 * @title AIO-Presale contract
 * @author 4ndrei
 * @dev Contract for holding the ERC20 (BEP20) token presale.
 * @notice Presale constants are instanciated in the constructor and are immutable.
 */
contract Presale is Ownable {
    struct Vesting {
        uint256 totalAmount;
        uint256 claimedAmount;
    }

    uint256 constant HUNDRED_PERCENTS = 100;
    uint256 constant MONTH = 30 days;

    uint256 internal immutable TO_DECIMALS;
    address public immutable TOKEN;
    uint256 public immutable START_TIME;
    uint256 public immutable PRICE;
    uint256 public endTime;

    uint256 public constant REF_SHARE = 5;
    uint256 public constant CLIFF_VESTING_SHARE = 40;
    uint256 public constant MONTHLY_VESTING_SHARE = 20;

    uint256 public amountLeft;

    mapping(address => Vesting) public userVesting;

    /**
     * @dev Emits on tokens purchase
     * @param user Tokens buyer
     * @param tokensBought Amount of tokens bought
     * @param amountPaid Amount of native currency provided
     */
    event Purchase(
        address indexed user,
        uint256 tokensBought,
        uint256 amountPaid
    );

    modifier checkSale() {
        require(
            block.timestamp >= START_TIME && block.timestamp <= endTime,
            "Presale: Presale is not active"
        );
        _;
    }

    /**
     *
     * @param _token Presale token address
     * @param _supply Presale token supply
     * @param _startTimestamp Timestamp of presale start
     * @param _presalePeriod Presale period in days
     * @param _price Presale single token price in native wei
     */
    constructor(
        address _token,
        uint256 _supply,
        uint256 _startTimestamp,
        uint256 _presalePeriod,
        uint256 _price
    ) Ownable() {
        TOKEN = _token;
        START_TIME = _startTimestamp;
        endTime = _startTimestamp + _presalePeriod * 1 days;
        PRICE = _price;

        TO_DECIMALS = 10 ** IERC20Metadata(TOKEN).decimals();

        amountLeft = _supply * TO_DECIMALS;
    }

    /**
     * Buy with referrals
     * @dev Converts all provided native currency to presale tokens and saves them for vesting
     * @param referral Address of referral's host
     */
    function buy(address payable referral) external payable {
        if (referral == msg.sender) buy();
        else referral.transfer((buy() * REF_SHARE) / HUNDRED_PERCENTS);
    }

    /**
     * @dev Claims all available tokens
     */
    function claim() external {
        uint256 amount = claimableAmount(msg.sender);
        require(amount > 0, "Claim: no tokens to claim");

        require(
            amount <= tokenBalance(),
            "Claim: Not enough tokens in the contract"
        );

        userVesting[msg.sender].claimedAmount += amount;

        IERC20(TOKEN).transfer(msg.sender, amount);
    }

    /**
     * @dev sends all native balance on contract to owner
     */
    function withdraw() external onlyOwner {
        require(
            block.timestamp > endTime,
            "Presale: Presale has not ended yet"
        );
        payable(owner()).transfer(address(this).balance);
    }

    function endPresale() external onlyOwner {
        require(
            block.timestamp >= START_TIME,
            "Presale: Presale has not ended yet"
        );

        endTime = block.timestamp;
    }

    /**
     * Buy without referral
     * @dev Converts all provided native currency to presale tokens and saves them for vesting
     */
    function buy() public payable checkSale returns (uint256 nativeForTokens) {
        uint256 tokensLeft = amountLeft; // saves SLOAD gas

        require(tokensLeft > 0, "Presale: No tokens left");

        uint256 tokenAmount = (msg.value * TO_DECIMALS) / PRICE;

        require(tokenAmount > 0, "Presale: Insufficient funds");

        nativeForTokens = msg.value;

        if (tokensLeft < tokenAmount) {
            nativeForTokens = (tokensLeft * PRICE) / TO_DECIMALS;
            tokenAmount = tokensLeft;
            endTime = block.timestamp;
        }

        unchecked {
            userVesting[msg.sender].totalAmount += tokenAmount;
            amountLeft -= tokenAmount;

            if (msg.value > nativeForTokens)
                payable(msg.sender).transfer(msg.value - nativeForTokens);
        }

        emit Purchase(msg.sender, tokenAmount, nativeForTokens);
    }

    /**
     * @param user User address that is checked for claimable amount
     * @return amountToClaim The amount of tokens to claim
     */
    function claimableAmount(
        address user
    ) public view returns (uint256 amountToClaim) {
        if (block.timestamp < endTime) return 0;

        uint256 noOfMonthPassed = (block.timestamp - endTime) / MONTH;

        Vesting memory vestingData = userVesting[user];

        uint256 amount = (vestingData.totalAmount *
            (CLIFF_VESTING_SHARE + noOfMonthPassed * MONTHLY_VESTING_SHARE)) /
            HUNDRED_PERCENTS;

        if (amount > vestingData.totalAmount)
            amountToClaim = vestingData.totalAmount - vestingData.claimedAmount;
        else amountToClaim = amount - vestingData.claimedAmount;
    }

    /**
     * @return Amount of tokens on the contract
     */
    function tokenBalance() public view returns (uint256) {
        return IERC20(TOKEN).balanceOf(address(this));
    }
}
