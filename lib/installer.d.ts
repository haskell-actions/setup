import { Arch, OS, Tool } from './opts';
export declare function installTool(tool: Tool, version: string, os: OS, arch: Arch): Promise<void>;
export declare function resetTool(tool: Tool, _version: string, os: OS, arch: Arch): Promise<void>;
export declare function addGhcupReleaseChannel(channel: URL, os: OS, arch: Arch): Promise<void>;
