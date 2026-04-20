import type { ClientWithSubscribeToIdentity, ClientWithSubscribeToPayer, SubscribeToCapability } from '../subscribe-to';

// [DESCRIBE] SubscribeToCapability
{
    // It takes a listener and returns an unsubscribe function.
    {
        const subscribe = null as unknown as SubscribeToCapability;
        const unsubscribe = subscribe(() => {});
        unsubscribe satisfies () => void;
    }
}

// [DESCRIBE] ClientWithSubscribeToPayer
{
    // It exposes a readonly `subscribeToPayer` of type `SubscribeToCapability`.
    {
        const client = null as unknown as ClientWithSubscribeToPayer;
        client.subscribeToPayer satisfies SubscribeToCapability;
    }
}

// [DESCRIBE] ClientWithSubscribeToIdentity
{
    // It exposes a readonly `subscribeToIdentity` of type `SubscribeToCapability`.
    {
        const client = null as unknown as ClientWithSubscribeToIdentity;
        client.subscribeToIdentity satisfies SubscribeToCapability;
    }
}
