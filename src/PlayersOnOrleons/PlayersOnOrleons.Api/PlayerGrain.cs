using PlayersOnOrleons.Abstractions;

namespace PlayersOnOrleons.Api;

public sealed class PlayerGrain : Grain<PlayerState>, IPlayerGrain
{
    public Task<PlayerSnapshot> GetAsync()
        => Task.FromResult(PlayerProgression.ToSnapshot(this.GetPrimaryKeyString(), State));

    public async Task<PlayerSnapshot> ClickAsync()
    {
        State = PlayerProgression.Click(State);
        await WriteStateAsync();

        return PlayerProgression.ToSnapshot(this.GetPrimaryKeyString(), State);
    }
}