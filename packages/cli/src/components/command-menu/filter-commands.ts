import type { Command } from "./types";
import { COMMANDS } from "./command";


export function getFilteredCommands(query: string): Command[] {
    if (!query) return COMMANDS;
    return COMMANDS.filter((command) => command.name.toLowerCase().includes(query.toLowerCase()));
}