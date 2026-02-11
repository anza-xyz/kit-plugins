export function litesvm(): <T extends object>(_client: T) => never {
    throw new Error(
        'The `litesvm` plugin is unavailable in browser and react-native. ' +
            'Use this plugin in a node environment instead.',
    );
}
