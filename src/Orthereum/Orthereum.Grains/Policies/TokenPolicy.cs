namespace Orthereum.Grains.Policies;

using Orthereum.Abstractions.Domain;

[GenerateSerializer, Immutable]
public sealed record TokenState(
    [property: Id(0)] string Name,
    [property: Id(1)] string Symbol,
    [property: Id(2)] decimal TotalSupply,
    [property: Id(3)] Dictionary<AccountAddress, decimal> Balances,
    [property: Id(4)] Dictionary<AllowanceKey, decimal> Allowances) : PolicyData;

public sealed class TokenPolicy : IPolicyExecutor
{
    public PolicyType PolicyType => PolicyType.Token;

    public PolicyData CreateInitialState(AccountAddress owner, PolicyData config)
    {
        var c = (TokenConfig)config;
        var balances = new Dictionary<AccountAddress, decimal>();
        if (c.InitialSupply > 0)
            balances[owner] = c.InitialSupply;
        return new TokenState(c.Name, c.Symbol, c.InitialSupply, balances, []);
    }

    public ValueTask<PolicyExecution> ExecuteAsync(PolicyData state, PolicyExecutionContext ctx)
    {
        var s = (TokenState)state;
        var result = ctx.Command switch
        {
            MintCommand cmd => Mint(s, ctx.PolicyAddress, ctx.Sender, cmd),
            TokenTransferCommand cmd => Transfer(s, ctx.PolicyAddress, ctx.Sender, cmd),
            BalanceQuery cmd => Balance(s, ctx.Sender, cmd),
            ApproveCommand cmd => Approve(s, ctx.PolicyAddress, ctx.Sender, cmd),
            TransferFromCommand cmd => TransferFrom(s, ctx.PolicyAddress, ctx.Sender, cmd),
            InfoQuery => Info(s),
            _ => new PolicyExecution(s, PolicyResult.Failure($"Unknown command: {ctx.Command.GetType().Name}"))
        };
        return ValueTask.FromResult(result);
    }

    private static PolicyExecution Mint(TokenState s, PolicyAddress policyAddr, AccountAddress sender, MintCommand cmd)
    {
        if (cmd.Amount <= 0)
            return new(s, PolicyResult.Failure("Invalid amount"));

        AccountAddress to = cmd.To ?? sender;
        var balances = new Dictionary<AccountAddress, decimal>(s.Balances);
        balances[to] = balances.GetValueOrDefault(to) + cmd.Amount;

        var newState = s with { TotalSupply = s.TotalSupply + cmd.Amount, Balances = balances };
        return new(newState, PolicyResult.Ok(
            [new Signal(policyAddr, "Mint", new MintSignal(to, cmd.Amount))],
            new BalanceOutput(balances[to])));
    }

    private static PolicyExecution Transfer(TokenState s, PolicyAddress policyAddr, AccountAddress sender, TokenTransferCommand cmd)
    {
        if (cmd.Amount <= 0)
            return new(s, PolicyResult.Failure("Invalid amount"));

        AccountAddress from = sender;
        AccountAddress to = cmd.To;
        var fromBalance = s.Balances.GetValueOrDefault(from);
        if (fromBalance < cmd.Amount)
            return new(s, PolicyResult.Failure("Insufficient token balance"));

        var balances = new Dictionary<AccountAddress, decimal>(s.Balances);

        if (from == to)
        {
            // Self-transfer: balance unchanged
            balances[from] = fromBalance;
        }
        else
        {
            balances[from] = fromBalance - cmd.Amount;
            balances[to] = s.Balances.GetValueOrDefault(to) + cmd.Amount;
        }

        var newState = s with { Balances = balances };
        return new(newState, PolicyResult.Ok([new Signal(policyAddr, "Transfer",
            new TransferSignal(sender, cmd.To, cmd.Amount))]));
    }

    private static PolicyExecution Balance(TokenState s, AccountAddress sender, BalanceQuery cmd)
    {
        AccountAddress target = cmd.Address ?? sender;
        var balance = s.Balances.GetValueOrDefault(target);
        return new(s, PolicyResult.Ok(output: new BalanceOutput(balance)));
    }

    private static PolicyExecution Approve(TokenState s, PolicyAddress policyAddr, AccountAddress sender, ApproveCommand cmd)
    {
        if (cmd.Amount < 0)
            return new(s, PolicyResult.Failure("Invalid amount"));

        var key = new AllowanceKey(sender, cmd.Spender);
        var allowances = new Dictionary<AllowanceKey, decimal>(s.Allowances) { [key] = cmd.Amount };

        var newState = s with { Allowances = allowances };
        return new(newState, PolicyResult.Ok([new Signal(policyAddr, "Approval",
            new ApprovalSignal(sender, cmd.Spender, cmd.Amount))]));
    }

    private static PolicyExecution TransferFrom(TokenState s, PolicyAddress policyAddr, AccountAddress sender, TransferFromCommand cmd)
    {
        if (cmd.Amount <= 0)
            return new(s, PolicyResult.Failure("Invalid amount"));

        var allowanceKey = new AllowanceKey(cmd.From, sender);
        var allowance = s.Allowances.GetValueOrDefault(allowanceKey);
        if (allowance < cmd.Amount)
            return new(s, PolicyResult.Failure("Insufficient allowance"));

        AccountAddress from = cmd.From;
        AccountAddress to = cmd.To;
        var fromBalance = s.Balances.GetValueOrDefault(from);
        if (fromBalance < cmd.Amount)
            return new(s, PolicyResult.Failure("Insufficient token balance"));

        var balances = new Dictionary<AccountAddress, decimal>(s.Balances)
        {
            [from] = fromBalance - cmd.Amount,
            [to] = s.Balances.GetValueOrDefault(to) + cmd.Amount
        };
        var allowances = new Dictionary<AllowanceKey, decimal>(s.Allowances)
        {
            [allowanceKey] = allowance - cmd.Amount
        };

        var newState = s with { Balances = balances, Allowances = allowances };
        return new(newState, PolicyResult.Ok([new Signal(policyAddr, "Transfer",
            new TransferSignal(cmd.From, cmd.To, cmd.Amount))]));
    }

    private static PolicyExecution Info(TokenState s) =>
        new(s, PolicyResult.Ok(output: new TokenInfoOutput(s.Name, s.Symbol, s.TotalSupply)));
}
