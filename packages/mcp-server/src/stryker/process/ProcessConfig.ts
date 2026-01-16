/**
 * Configuration required to spawn the StrykerJS server.  This is provided as
 * a value via the DI system so you can construct this object based on
 * environment variables or a configuration file without tightly coupling it
 * to the `Process` class.
 */
export interface ProcessConfig {
	/** Path to the `stryker` executable, e.g. `node_modules/.bin/stryker`. */
	path: string;
	/** Command‑line arguments to start the server. Default `["serve", "stdio"]`. */
	args?: string[];
	/** Working directory to use when spawning Stryker. */
	cwd?: string;
	/** Optional path to the Stryker config file to use during initialization. */
	configFilePath?: string;
}
