/**
 * Controls whether the RPC transaction planner and executor automatically
 * reserve, estimate, and set transaction resource limits.
 */
export type ResourceLimitEstimationMode = 'estimate' | 'none';

export function shouldEstimateResourceLimits(mode: ResourceLimitEstimationMode | undefined): boolean {
    return mode !== 'none';
}
