// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title SToken
/// @notice Non-rebasing receipt token for a Sentinel lending reserve.
/// @dev The pool that controls this token is recorded immutably at deployment.
///      Because Sentinel lending is interest-free, supply and underlying remain
///      strictly 1:1 — no exchange-rate logic is required.
contract SToken is ERC20 {
    /// @notice Address of the LendingPool that mints and burns this token.
    address public immutable pool;

    /// @notice Underlying asset this sToken represents 1:1.
    address public immutable underlying;

    /// @notice Decimals of the underlying, mirrored here so wallets display
    ///         balances on the same scale as the underlying ERC20.
    uint8 private immutable _decimals;

    error OnlyPool();

    modifier onlyPool() {
        if (msg.sender != pool) revert OnlyPool();
        _;
    }

    constructor(
        address pool_,
        address underlying_,
        uint8 underlyingDecimals_,
        string memory name_,
        string memory symbol_
    )
        ERC20(name_, symbol_)
    {
        pool = pool_;
        underlying = underlying_;
        _decimals = underlyingDecimals_;
    }

    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    /// @notice Mints sTokens to `to` against a 1:1 deposit of underlying.
    /// @dev Caller MUST be the pool. The pool is responsible for pulling the
    ///      underlying tokens before calling mint.
    function mint(address to, uint256 amount) external onlyPool {
        _mint(to, amount);
    }

    /// @notice Burns sTokens from `from` and signals the pool to release
    ///         underlying. The pool itself performs the underlying transfer.
    function burn(address from, uint256 amount) external onlyPool {
        _burn(from, amount);
    }
}
