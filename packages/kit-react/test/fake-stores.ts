import type {
    ReactiveActionState,
    ReactiveActionStore,
    ReactiveStreamState,
    ReactiveStreamStore,
} from '../src/kit-prereqs';

/**
 * Controllable fake of a {@link ReactiveStreamStore} for unit tests. Call
 * `emit`/`fail`/`setState` to drive state transitions; subscribers get
 * notified synchronously.
 */
export interface FakeStreamStore<T> extends ReactiveStreamStore<T> {
    emit: (value: T) => void;
    fail: (error: unknown) => void;
    setState: (state: ReactiveStreamState<T>) => void;
}

/**
 * Build a fake stream store starting in `loading`. Controllable via
 * `emit`, `fail`, `setState`.
 */
export function fakeStreamStore<T>(): FakeStreamStore<T> {
    const listeners = new Set<() => void>();
    let state: ReactiveStreamState<T> = { data: undefined, error: undefined, status: 'loading' };
    const notify = () => listeners.forEach(l => l());
    return {
        emit(value) {
            state = { data: value, error: undefined, status: 'loaded' };
            notify();
        },
        fail(error) {
            state = { data: state.data, error, status: 'error' };
            notify();
        },
        getError: () => state.error,
        getState: () => state.data,
        getUnifiedState: () => state,
        retry() {
            if (state.status === 'error') {
                state = { data: state.data, error: undefined, status: 'retrying' };
                notify();
            }
        },
        setState(next) {
            state = next;
            notify();
        },
        subscribe(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
    };
}

/**
 * Controllable fake of a {@link ReactiveActionStore}. `setState` drives
 * synchronous transitions; `dispatch` / `dispatchAsync` are no-ops unless
 * you override them.
 */
export interface FakeActionStore<T> extends ReactiveActionStore<[], T> {
    setState: (state: ReactiveActionState<T>) => void;
}

export function fakeActionStore<T>(): FakeActionStore<T> {
    const listeners = new Set<() => void>();
    let state: ReactiveActionState<T> = { data: undefined, error: undefined, status: 'idle' };
    const notify = () => listeners.forEach(l => l());
    return {
        dispatch: () => {},
        dispatchAsync: () => new Promise<T>(() => {}),
        getState: () => state,
        reset: () => {
            state = { data: undefined, error: undefined, status: 'idle' };
            notify();
        },
        setState(next) {
            state = next;
            notify();
        },
        subscribe(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
    };
}
