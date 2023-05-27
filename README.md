# AIO-ecosystem contracts

This repo contains AIO token and presale contracts and automatic tests for them.

## AIOToken

The AIOToken offers a number of capabilities, which briefly are described below.

### BEP-20

The AIOToken implements the ERC20 interface.

### Ownable

The contract has an Owner, who can change the owner, renounce ownership and access assigning burner function.

### Pancakeswap

The BNB/AIO pool is created in the constructor on contract deployment.

### Burn

Only one address has an opportunity to burn tokens. That way we implement the subscription mechanism also reducing supply.

Initially the burner address is 0x00..00. There is an option to assign and change burner address.

### Mint

Total supply is minted in the constructor. Mint function is absent.

## Presale

Contract for holding a token presale. Presale parameters are either instanciated in the constructor or hardcoded and are immutable.

### Ownable

The contract has an Owner, who can change the owner, renounce ownership and access onlyOwner functions.

### IERC20

Presale contract makes use of IERC20 interface to read token contract variables.

### Referrals

Referrals are paid by passing an address parameter to a `buy()` function. They receive a constant share that is hardcoded in contract (5%).

### Buy

`buy()` function is overloaded with its nephew `buy(address)` which is for purchasing using referral link.

### Claim

User may claim a valid amount of vested tokens by pulling them from the presale contract.

## Running Tests

To run tests, run the following command

```bash
  npx hardhat test
```

## License

[MIT](https://choosealicense.com/licenses/mit/)

## Authors

- [@4ndrei](https://github.com/andrei-samokish)
- [@ThomasAqu1nas](https://github.com/ThomasAqu1nas)
