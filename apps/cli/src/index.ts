#!/usr/bin/env node

import { Command } from "commander";

const program = new Command();

program
  .name("memost")
  .description("Command line tools for Memost.")
  .version("0.1.0");

program
  .command("hello")
  .description("Print a test message from the Memost CLI.")
  .action(() => {
    console.log("Hello from Memost CLI.");
  });

program.parse();
