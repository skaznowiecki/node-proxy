/**
 * Server configuration for multi-threading/clustering
 */
export interface ServerConfig {
    /**
     * Enable cluster mode (multi-process)
     * @default false
     */
    cluster?: boolean;

    /**
     * Number of worker processes to spawn
     * If not specified, defaults to number of CPU cores
     * @default os.cpus().length
     */
    workers?: number;
}