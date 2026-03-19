use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token_interface::{
    close_account, transfer_checked, CloseAccount, Mint, TokenAccount, TokenInterface,
    TransferChecked,
};

declare_id!("3T5TjDgMGppPwW3K7waUUuipSveiBSrWBKi957TEirH6");

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_CONDITIONS: usize = 8;
const HASH_LEN: usize = 32;
const MAX_MEMO_LEN: usize = 128;
const MIN_EXPIRY_SECONDS: i64 = 3_600; // 1 hour
const MAX_EXPIRY_SECONDS: i64 = 365 * 24 * 3_600; // 1 year

macro_rules! pact_seeds {
    ($pact:expr) => {
        &[
            b"pact".as_ref(),
            $pact.issuer.as_ref(),
            $pact.beneficiary.as_ref(),
            $pact.terms_hash.as_ref(),
            &[$pact.bump],
        ]
    };
}

// ---------------------------------------------------------------------------
// Program
// ---------------------------------------------------------------------------

#[program]
pub mod pact_protocol {
    use super::*;

    /// Create a new Pact: lock collateral in escrow, record terms.
    pub fn initialize_pact(
        ctx: Context<InitializePact>,
        collateral_amount: u64,
        expiry_seconds: i64,
        terms_hash: [u8; HASH_LEN],
        memo: Vec<u8>,
    ) -> Result<()> {
        require!(collateral_amount > 0, PactError::ZeroAmount);
        require!(
            expiry_seconds >= MIN_EXPIRY_SECONDS && expiry_seconds <= MAX_EXPIRY_SECONDS,
            PactError::InvalidExpiry
        );
        require!(memo.len() <= MAX_MEMO_LEN, PactError::MemoTooLong);

        let clock = Clock::get()?;

        let pact = &mut ctx.accounts.pact;
        pact.issuer = ctx.accounts.issuer.key();
        pact.beneficiary = ctx.accounts.beneficiary.key();
        pact.agent_authority = Pubkey::default();
        pact.collateral_mint = ctx.accounts.collateral_mint.key();
        pact.collateral_amount = collateral_amount;
        pact.condition_count = 0;
        pact.conditions_fulfilled = 0;
        pact.status = PactStatus::Active;
        pact.created_at = clock.unix_timestamp;
        pact.expiry_at = clock
            .unix_timestamp
            .checked_add(expiry_seconds)
            .ok_or(PactError::Overflow)?;
        pact.resolved_at = 0;
        pact.terms_hash = terms_hash;
        pact.reasoning_hash = [0u8; HASH_LEN];
        pact.bump = ctx.bumps.pact;
        pact.vault_bump = ctx.bumps.vault;

        let mut memo_buf = [0u8; MAX_MEMO_LEN];
        memo_buf[..memo.len()].copy_from_slice(&memo);
        pact.memo = memo_buf;
        pact.memo_len = memo.len() as u8;

        // Lock collateral: transfer from issuer to vault PDA
        transfer_checked(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.issuer_token_account.to_account_info(),
                    to: ctx.accounts.vault.to_account_info(),
                    authority: ctx.accounts.issuer.to_account_info(),
                    mint: ctx.accounts.collateral_mint.to_account_info(),
                },
            ),
            collateral_amount,
            ctx.accounts.collateral_mint.decimals,
        )?;

        emit!(PactCreatedEvent {
            pact: pact.key(),
            issuer: pact.issuer,
            beneficiary: pact.beneficiary,
            collateral_mint: pact.collateral_mint,
            collateral_amount,
            expiry_at: pact.expiry_at,
            terms_hash,
        });

        Ok(())
    }

    /// Set the AI agent authority that can auto-fulfill conditions.
    pub fn set_agent(ctx: Context<SetAgent>, agent: Pubkey) -> Result<()> {
        let pact = &mut ctx.accounts.pact;
        require!(pact.status == PactStatus::Active, PactError::InvalidStatus);

        pact.agent_authority = agent;

        emit!(AgentSetEvent {
            pact: pact.key(),
            agent,
        });

        Ok(())
    }

    /// Add a condition to an active Pact. Only issuer can add.
    pub fn add_condition(
        ctx: Context<AddCondition>,
        condition_type: ConditionType,
        description_hash: [u8; HASH_LEN],
        oracle: Pubkey,
        auto_fulfill_at: i64,
    ) -> Result<()> {
        let pact = &mut ctx.accounts.pact;

        require!(pact.status == PactStatus::Active, PactError::InvalidStatus);
        require!(
            (pact.condition_count as usize) < MAX_CONDITIONS,
            PactError::TooManyConditions
        );

        if condition_type == ConditionType::TimeBased {
            let clock = Clock::get()?;
            require!(
                auto_fulfill_at > clock.unix_timestamp,
                PactError::InvalidAutoFulfillTime
            );
            require!(
                auto_fulfill_at <= pact.expiry_at,
                PactError::AutoFulfillAfterExpiry
            );
        }

        if condition_type == ConditionType::Oracle {
            require!(oracle != Pubkey::default(), PactError::OracleRequired);
        }

        let condition = &mut ctx.accounts.condition;
        condition.pact = pact.key();
        condition.index = pact.condition_count;
        condition.condition_type = condition_type;
        condition.description_hash = description_hash;
        condition.fulfilled = false;
        condition.fulfilled_by = Pubkey::default();
        condition.fulfilled_at = 0;
        condition.proof_hash = [0u8; HASH_LEN];
        condition.oracle = oracle;
        condition.auto_fulfill_at = auto_fulfill_at;
        condition.bump = ctx.bumps.condition;

        pact.condition_count += 1;

        emit!(ConditionAddedEvent {
            pact: pact.key(),
            index: condition.index,
            condition_type,
            description_hash,
        });

        Ok(())
    }

    /// Fulfill a condition. Authorization depends on condition type.
    pub fn fulfill_condition(
        ctx: Context<FulfillCondition>,
        proof_hash: [u8; HASH_LEN],
    ) -> Result<()> {
        let pact = &mut ctx.accounts.pact;
        let condition = &mut ctx.accounts.condition;
        let clock = Clock::get()?;
        let signer = ctx.accounts.fulfiller.key();

        require!(pact.status == PactStatus::Active, PactError::InvalidStatus);
        require!(!condition.fulfilled, PactError::AlreadyFulfilled);
        require!(clock.unix_timestamp < pact.expiry_at, PactError::PactExpired);

        match condition.condition_type {
            ConditionType::Manual => {
                require!(
                    signer == pact.issuer || signer == pact.beneficiary,
                    PactError::Unauthorized
                );
            }
            ConditionType::Agent => {
                require!(
                    pact.agent_authority != Pubkey::default(),
                    PactError::NoAgentConfigured
                );
                require!(signer == pact.agent_authority, PactError::Unauthorized);
            }
            ConditionType::Oracle => {
                require!(signer == condition.oracle, PactError::Unauthorized);
            }
            ConditionType::TimeBased => {
                require!(
                    clock.unix_timestamp >= condition.auto_fulfill_at,
                    PactError::TimeConditionNotMet
                );
            }
            ConditionType::DocumentVerification => {
                require!(proof_hash != [0u8; HASH_LEN], PactError::InvalidProof);
            }
        }

        condition.fulfilled = true;
        condition.fulfilled_by = signer;
        condition.fulfilled_at = clock.unix_timestamp;
        condition.proof_hash = proof_hash;

        pact.conditions_fulfilled += 1;

        emit!(ConditionFulfilledEvent {
            pact: pact.key(),
            index: condition.index,
            fulfilled_by: signer,
            proof_hash,
            conditions_remaining: pact.condition_count - pact.conditions_fulfilled,
        });

        Ok(())
    }

    /// Settle a Pact: release collateral to beneficiary when all conditions met.
    pub fn settle_pact(ctx: Context<SettlePact>) -> Result<()> {
        let clock = Clock::get()?;

        // Extract values before CPI to avoid borrow conflicts
        let collateral_amount = ctx.accounts.pact.collateral_amount;
        let beneficiary_key = ctx.accounts.pact.beneficiary;
        let pact_key = ctx.accounts.pact.key();
        let seeds: &[&[u8]] = &[
            b"pact".as_ref(),
            ctx.accounts.pact.issuer.as_ref(),
            ctx.accounts.pact.beneficiary.as_ref(),
            ctx.accounts.pact.terms_hash.as_ref(),
            &[ctx.accounts.pact.bump],
        ];

        transfer_checked(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.vault.to_account_info(),
                    to: ctx.accounts.beneficiary_token_account.to_account_info(),
                    authority: ctx.accounts.pact.to_account_info(),
                    mint: ctx.accounts.collateral_mint.to_account_info(),
                },
                &[seeds],
            ),
            collateral_amount,
            ctx.accounts.collateral_mint.decimals,
        )?;

        close_account(CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            CloseAccount {
                account: ctx.accounts.vault.to_account_info(),
                destination: ctx.accounts.issuer.to_account_info(),
                authority: ctx.accounts.pact.to_account_info(),
            },
            &[seeds],
        ))?;

        let pact = &mut ctx.accounts.pact;
        pact.status = PactStatus::Settled;
        pact.resolved_at = clock.unix_timestamp;

        emit!(PactSettledEvent {
            pact: pact_key,
            beneficiary: beneficiary_key,
            collateral_amount,
            settled_at: clock.unix_timestamp,
        });

        Ok(())
    }

    /// Dispute a Pact: either party can file.
    pub fn dispute_pact(
        ctx: Context<DisputePact>,
        reason_hash: [u8; HASH_LEN],
    ) -> Result<()> {
        let pact = &mut ctx.accounts.pact;
        let clock = Clock::get()?;
        let signer = ctx.accounts.disputer.key();

        require!(pact.status == PactStatus::Active, PactError::InvalidStatus);
        require!(
            signer == pact.issuer || signer == pact.beneficiary,
            PactError::Unauthorized
        );

        pact.status = PactStatus::Disputed;
        pact.reasoning_hash = reason_hash;

        emit!(PactDisputedEvent {
            pact: pact.key(),
            filed_by: signer,
            reason_hash,
            timestamp: clock.unix_timestamp,
        });

        Ok(())
    }

    /// Force-recall: institutional override. Returns collateral to issuer.
    pub fn force_recall(ctx: Context<ForceRecall>) -> Result<()> {
        let clock = Clock::get()?;

        require!(
            ctx.accounts.pact.status == PactStatus::Active
                || ctx.accounts.pact.status == PactStatus::Disputed,
            PactError::InvalidStatus
        );

        let collateral_amount = ctx.accounts.pact.collateral_amount;
        let pact_key = ctx.accounts.pact.key();
        let delegate_key = ctx.accounts.delegate.key();
        let seeds: &[&[u8]] = &[
            b"pact".as_ref(),
            ctx.accounts.pact.issuer.as_ref(),
            ctx.accounts.pact.beneficiary.as_ref(),
            ctx.accounts.pact.terms_hash.as_ref(),
            &[ctx.accounts.pact.bump],
        ];

        transfer_checked(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.vault.to_account_info(),
                    to: ctx.accounts.issuer_token_account.to_account_info(),
                    authority: ctx.accounts.pact.to_account_info(),
                    mint: ctx.accounts.collateral_mint.to_account_info(),
                },
                &[seeds],
            ),
            collateral_amount,
            ctx.accounts.collateral_mint.decimals,
        )?;

        close_account(CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            CloseAccount {
                account: ctx.accounts.vault.to_account_info(),
                destination: ctx.accounts.delegate.to_account_info(),
                authority: ctx.accounts.pact.to_account_info(),
            },
            &[seeds],
        ))?;

        let pact = &mut ctx.accounts.pact;
        pact.status = PactStatus::Recalled;
        pact.resolved_at = clock.unix_timestamp;

        emit!(PactRecalledEvent {
            pact: pact_key,
            recalled_by: delegate_key,
            collateral_returned: collateral_amount,
            timestamp: clock.unix_timestamp,
        });

        Ok(())
    }

    /// Expire a Pact: anyone can crank after expiry if conditions not all met.
    pub fn expire_pact(ctx: Context<ExpirePact>) -> Result<()> {
        let clock = Clock::get()?;

        require!(
            ctx.accounts.pact.status == PactStatus::Active,
            PactError::InvalidStatus
        );
        require!(
            clock.unix_timestamp > ctx.accounts.pact.expiry_at,
            PactError::NotExpired
        );
        require!(
            ctx.accounts.pact.conditions_fulfilled < ctx.accounts.pact.condition_count,
            PactError::AllConditionsMet
        );

        let collateral_amount = ctx.accounts.pact.collateral_amount;
        let pact_key = ctx.accounts.pact.key();
        let conditions_fulfilled = ctx.accounts.pact.conditions_fulfilled;
        let conditions_total = ctx.accounts.pact.condition_count;
        let seeds: &[&[u8]] = &[
            b"pact".as_ref(),
            ctx.accounts.pact.issuer.as_ref(),
            ctx.accounts.pact.beneficiary.as_ref(),
            ctx.accounts.pact.terms_hash.as_ref(),
            &[ctx.accounts.pact.bump],
        ];

        transfer_checked(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.vault.to_account_info(),
                    to: ctx.accounts.issuer_token_account.to_account_info(),
                    authority: ctx.accounts.pact.to_account_info(),
                    mint: ctx.accounts.collateral_mint.to_account_info(),
                },
                &[seeds],
            ),
            collateral_amount,
            ctx.accounts.collateral_mint.decimals,
        )?;

        close_account(CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            CloseAccount {
                account: ctx.accounts.vault.to_account_info(),
                destination: ctx.accounts.issuer.to_account_info(),
                authority: ctx.accounts.pact.to_account_info(),
            },
            &[seeds],
        ))?;

        let pact = &mut ctx.accounts.pact;
        pact.status = PactStatus::Expired;
        pact.resolved_at = clock.unix_timestamp;

        emit!(PactExpiredEvent {
            pact: pact_key,
            conditions_fulfilled,
            conditions_total,
            collateral_returned: collateral_amount,
            timestamp: clock.unix_timestamp,
        });

        Ok(())
    }
}

// ---------------------------------------------------------------------------
// Account Contexts
// ---------------------------------------------------------------------------

#[derive(Accounts)]
#[instruction(collateral_amount: u64, expiry_seconds: i64, terms_hash: [u8; 32])]
pub struct InitializePact<'info> {
    #[account(mut)]
    pub issuer: Signer<'info>,

    /// CHECK: Stored as pubkey only.
    pub beneficiary: UncheckedAccount<'info>,

    pub collateral_mint: InterfaceAccount<'info, Mint>,

    #[account(
        init,
        payer = issuer,
        space = Pact::LEN,
        seeds = [
            b"pact",
            issuer.key().as_ref(),
            beneficiary.key().as_ref(),
            terms_hash.as_ref(),
        ],
        bump,
    )]
    pub pact: Account<'info, Pact>,

    #[account(
        init,
        payer = issuer,
        seeds = [b"vault", pact.key().as_ref()],
        bump,
        token::mint = collateral_mint,
        token::authority = pact,
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        associated_token::mint = collateral_mint,
        associated_token::authority = issuer,
    )]
    pub issuer_token_account: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SetAgent<'info> {
    pub issuer: Signer<'info>,

    #[account(
        mut,
        has_one = issuer,
        constraint = pact.status == PactStatus::Active @ PactError::InvalidStatus,
    )]
    pub pact: Account<'info, Pact>,
}

#[derive(Accounts)]
pub struct AddCondition<'info> {
    #[account(mut)]
    pub issuer: Signer<'info>,

    #[account(
        mut,
        has_one = issuer,
        constraint = pact.status == PactStatus::Active @ PactError::InvalidStatus,
    )]
    pub pact: Account<'info, Pact>,

    #[account(
        init,
        payer = issuer,
        space = Condition::LEN,
        seeds = [
            b"condition",
            pact.key().as_ref(),
            &[pact.condition_count],
        ],
        bump,
    )]
    pub condition: Account<'info, Condition>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct FulfillCondition<'info> {
    pub fulfiller: Signer<'info>,

    #[account(
        mut,
        constraint = pact.status == PactStatus::Active @ PactError::InvalidStatus,
    )]
    pub pact: Account<'info, Pact>,

    #[account(
        mut,
        seeds = [
            b"condition",
            pact.key().as_ref(),
            &[condition.index],
        ],
        bump = condition.bump,
        constraint = condition.pact == pact.key() @ PactError::ConditionMismatch,
        constraint = !condition.fulfilled @ PactError::AlreadyFulfilled,
    )]
    pub condition: Account<'info, Condition>,
}

#[derive(Accounts)]
pub struct SettlePact<'info> {
    #[account(mut)]
    pub beneficiary: Signer<'info>,

    /// CHECK: Receives rent from closed vault.
    #[account(
        mut,
        constraint = issuer.key() == pact.issuer @ PactError::Unauthorized,
    )]
    pub issuer: UncheckedAccount<'info>,

    #[account(
        mut,
        has_one = beneficiary,
        constraint = pact.status == PactStatus::Active @ PactError::InvalidStatus,
        constraint = pact.conditions_fulfilled == pact.condition_count @ PactError::ConditionsNotMet,
        constraint = pact.condition_count > 0 @ PactError::NoConditions,
    )]
    pub pact: Account<'info, Pact>,

    #[account(
        mut,
        seeds = [b"vault", pact.key().as_ref()],
        bump = pact.vault_bump,
        token::mint = collateral_mint,
        token::authority = pact,
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,

    pub collateral_mint: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        token::mint = collateral_mint,
        token::authority = beneficiary,
    )]
    pub beneficiary_token_account: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
pub struct DisputePact<'info> {
    #[account(mut)]
    pub disputer: Signer<'info>,

    #[account(
        mut,
        constraint = pact.status == PactStatus::Active @ PactError::InvalidStatus,
        constraint = (
            disputer.key() == pact.issuer ||
            disputer.key() == pact.beneficiary
        ) @ PactError::Unauthorized,
    )]
    pub pact: Account<'info, Pact>,
}

#[derive(Accounts)]
pub struct ForceRecall<'info> {
    #[account(mut)]
    pub delegate: Signer<'info>,

    #[account(
        mut,
        constraint = delegate.key() == pact.issuer @ PactError::Unauthorized,
    )]
    pub pact: Account<'info, Pact>,

    #[account(
        mut,
        seeds = [b"vault", pact.key().as_ref()],
        bump = pact.vault_bump,
        token::mint = collateral_mint,
        token::authority = pact,
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,

    pub collateral_mint: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        token::mint = collateral_mint,
        token::authority = pact.issuer,
    )]
    pub issuer_token_account: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
pub struct ExpirePact<'info> {
    pub cranker: Signer<'info>,

    /// CHECK: Receives rent from closed vault.
    #[account(
        mut,
        constraint = issuer.key() == pact.issuer @ PactError::Unauthorized,
    )]
    pub issuer: UncheckedAccount<'info>,

    #[account(
        mut,
        constraint = pact.status == PactStatus::Active @ PactError::InvalidStatus,
    )]
    pub pact: Account<'info, Pact>,

    #[account(
        mut,
        seeds = [b"vault", pact.key().as_ref()],
        bump = pact.vault_bump,
        token::mint = collateral_mint,
        token::authority = pact,
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,

    pub collateral_mint: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        token::mint = collateral_mint,
        token::authority = pact.issuer,
    )]
    pub issuer_token_account: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

#[account]
pub struct Pact {
    pub issuer: Pubkey,                     // 32
    pub beneficiary: Pubkey,                // 32
    pub agent_authority: Pubkey,            // 32
    pub collateral_mint: Pubkey,            // 32
    pub collateral_amount: u64,             // 8
    pub condition_count: u8,                // 1
    pub conditions_fulfilled: u8,           // 1
    pub status: PactStatus,                 // 1
    pub created_at: i64,                    // 8
    pub expiry_at: i64,                     // 8
    pub resolved_at: i64,                   // 8
    pub terms_hash: [u8; HASH_LEN],         // 32
    pub reasoning_hash: [u8; HASH_LEN],     // 32
    pub memo: [u8; MAX_MEMO_LEN],           // 128
    pub memo_len: u8,                       // 1
    pub bump: u8,                           // 1
    pub vault_bump: u8,                     // 1
}

impl Pact {
    // 8 + 32*4 + 8 + 1+1+1 + 8+8+8 + 32+32 + 128 + 1+1+1 = 8 + 128 + 8 + 3 + 24 + 64 + 128 + 3 = 366
    pub const LEN: usize = 8 + 128 + 8 + 3 + 24 + 64 + 128 + 3;
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub enum PactStatus {
    Active,
    Settled,
    Disputed,
    Expired,
    Cancelled,
    Recalled,
}

#[account]
pub struct Condition {
    pub pact: Pubkey,                       // 32
    pub index: u8,                          // 1
    pub condition_type: ConditionType,      // 1
    pub description_hash: [u8; HASH_LEN],  // 32
    pub fulfilled: bool,                    // 1
    pub fulfilled_by: Pubkey,               // 32
    pub fulfilled_at: i64,                  // 8
    pub proof_hash: [u8; HASH_LEN],         // 32
    pub oracle: Pubkey,                     // 32
    pub auto_fulfill_at: i64,               // 8
    pub bump: u8,                           // 1
}

impl Condition {
    // 8 + 32 + 1 + 1 + 32 + 1 + 32 + 8 + 32 + 32 + 8 + 1 = 188
    pub const LEN: usize = 8 + 32 + 1 + 1 + 32 + 1 + 32 + 8 + 32 + 32 + 8 + 1;
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub enum ConditionType {
    Manual,
    Agent,
    Oracle,
    TimeBased,
    DocumentVerification,
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

#[event]
pub struct PactCreatedEvent {
    pub pact: Pubkey,
    pub issuer: Pubkey,
    pub beneficiary: Pubkey,
    pub collateral_mint: Pubkey,
    pub collateral_amount: u64,
    pub expiry_at: i64,
    pub terms_hash: [u8; HASH_LEN],
}

#[event]
pub struct AgentSetEvent {
    pub pact: Pubkey,
    pub agent: Pubkey,
}

#[event]
pub struct ConditionAddedEvent {
    pub pact: Pubkey,
    pub index: u8,
    pub condition_type: ConditionType,
    pub description_hash: [u8; HASH_LEN],
}

#[event]
pub struct ConditionFulfilledEvent {
    pub pact: Pubkey,
    pub index: u8,
    pub fulfilled_by: Pubkey,
    pub proof_hash: [u8; HASH_LEN],
    pub conditions_remaining: u8,
}

#[event]
pub struct PactSettledEvent {
    pub pact: Pubkey,
    pub beneficiary: Pubkey,
    pub collateral_amount: u64,
    pub settled_at: i64,
}

#[event]
pub struct PactDisputedEvent {
    pub pact: Pubkey,
    pub filed_by: Pubkey,
    pub reason_hash: [u8; HASH_LEN],
    pub timestamp: i64,
}

#[event]
pub struct PactRecalledEvent {
    pub pact: Pubkey,
    pub recalled_by: Pubkey,
    pub collateral_returned: u64,
    pub timestamp: i64,
}

#[event]
pub struct PactExpiredEvent {
    pub pact: Pubkey,
    pub conditions_fulfilled: u8,
    pub conditions_total: u8,
    pub collateral_returned: u64,
    pub timestamp: i64,
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

#[error_code]
pub enum PactError {
    #[msg("Amount must be greater than zero")]
    ZeroAmount,
    #[msg("Arithmetic overflow")]
    Overflow,
    #[msg("Invalid Pact status for this operation")]
    InvalidStatus,
    #[msg("Expiry must be between 1 hour and 365 days")]
    InvalidExpiry,
    #[msg("Pact has expired")]
    PactExpired,
    #[msg("Pact has not yet expired")]
    NotExpired,
    #[msg("Maximum conditions (8) reached")]
    TooManyConditions,
    #[msg("Condition already fulfilled")]
    AlreadyFulfilled,
    #[msg("Not all conditions are met")]
    ConditionsNotMet,
    #[msg("Pact has no conditions")]
    NoConditions,
    #[msg("Condition does not belong to this Pact")]
    ConditionMismatch,
    #[msg("Time-based condition not yet met")]
    TimeConditionNotMet,
    #[msg("Auto-fulfill time must be before Pact expiry")]
    AutoFulfillAfterExpiry,
    #[msg("Invalid auto-fulfill time")]
    InvalidAutoFulfillTime,
    #[msg("Oracle pubkey required for oracle-type conditions")]
    OracleRequired,
    #[msg("Invalid proof hash")]
    InvalidProof,
    #[msg("Signer is not authorized")]
    Unauthorized,
    #[msg("No agent authority configured")]
    NoAgentConfigured,
    #[msg("Memo exceeds maximum length")]
    MemoTooLong,
    #[msg("All conditions already met")]
    AllConditionsMet,
}
