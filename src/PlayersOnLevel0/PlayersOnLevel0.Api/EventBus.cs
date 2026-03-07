// EventBus.cs — In-memory event bus using System.Threading.Channels.
// Per-player fanout: multiple SSE subscribers each get their own channel.
// This is the ASP.NET hosting adapter for IPlayerEventSink.
// Orleans would replace this with Orleans Streams.

using System.Collections.Concurrent;
using System.Runtime.CompilerServices;
using System.Threading.Channels;

namespace PlayersOnLevel0.Api;

/// <summary>
/// Subscription handle for a single SSE listener.
/// </summary>
public interface IPlayerEventSubscription : IAsyncDisposable
{
    IAsyncEnumerable<PlayerEvent> ReadAllAsync(CancellationToken ct = default);
}

/// <summary>
/// In-memory event bus. Publishes to all active subscribers for a given player.
/// Not persisted — if a subscriber connects after an event, they miss it.
/// Use GET /players/{id} for current state; events are for live updates only.
/// </summary>
public sealed class InMemoryPlayerEventBus : IPlayerEventSink
{
    readonly ConcurrentDictionary<PlayerId, ConcurrentDictionary<Guid, Channel<PlayerEvent>>> _subscriptions = new();

    public ValueTask PublishAsync(PlayerEvent evt, CancellationToken ct = default)
    {
        if (!_subscriptions.TryGetValue(evt.PlayerId, out var channels))
            return ValueTask.CompletedTask;

        foreach (var (_, channel) in channels)
            channel.Writer.TryWrite(evt); // non-blocking; drops if subscriber is slow

        return ValueTask.CompletedTask;
    }

    public IPlayerEventSubscription Subscribe(PlayerId playerId)
    {
        var channel = Channel.CreateBounded<PlayerEvent>(new BoundedChannelOptions(256)
        {
            FullMode = BoundedChannelFullMode.DropOldest,
            SingleReader = true,
            SingleWriter = false
        });

        var playerChannels = _subscriptions.GetOrAdd(playerId, _ => new ConcurrentDictionary<Guid, Channel<PlayerEvent>>());
        var subscriptionId = Guid.NewGuid();
        playerChannels.TryAdd(subscriptionId, channel);

        return new Subscription(this, playerId, subscriptionId, channel);
    }

    void Unsubscribe(PlayerId playerId, Guid subscriptionId)
    {
        if (_subscriptions.TryGetValue(playerId, out var channels))
        {
            if (channels.TryRemove(subscriptionId, out var channel))
                channel.Writer.TryComplete();

            // Clean up empty player entries
            if (channels.IsEmpty)
                _subscriptions.TryRemove(playerId, out _);
        }
    }

    sealed class Subscription(
        InMemoryPlayerEventBus bus,
        PlayerId playerId,
        Guid subscriptionId,
        Channel<PlayerEvent> channel) : IPlayerEventSubscription
    {
        public async IAsyncEnumerable<PlayerEvent> ReadAllAsync([EnumeratorCancellation] CancellationToken ct = default)
        {
            await foreach (var evt in channel.Reader.ReadAllAsync(ct))
                yield return evt;
        }

        public ValueTask DisposeAsync()
        {
            bus.Unsubscribe(playerId, subscriptionId);
            return ValueTask.CompletedTask;
        }
    }
}
