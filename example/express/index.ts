import fs from "node:fs";
import path from "node:path";

import express from "express";

import { generate } from "../../src/generator.js";

interface ServerConfig {
	port: number;
	host: string;
}

interface LoggingConfig {
	level: "debug" | "info" | "warn" | "error";
	format: "json" | "text";
}

interface DatabaseConfig {
	host: string;
	port: number;
	username: string;
	password: string;
	name: string;
}

interface AppConfig {
	server: ServerConfig;
	logging: LoggingConfig;
	database: DatabaseConfig;
}

// Load configuration from JSON file
const configFilePath = path.join(import.meta.dirname, "./config.json");
const config = JSON.parse(fs.readFileSync(configFilePath, "utf8")) as AppConfig;

generate({
	tsconfigFilePath: path.join(import.meta.dirname, "./tsconfig.json"),
	inputFile: path.join(import.meta.dirname, "./index.ts"),
	outputFile: path.join(import.meta.dirname, "./validator.ts"),
	variableName: "config",
});

// Import the generated validator dynamically
const { validator } = await import("./validator.js");

// Create Express app
const app = express();

// @ts-ignore: simulate missconfiguration
config.server.host = true;
// 👇👇
// [
// 	{
// 		path: "server.host",
// 		value: true,
// 		expected: "string",
// 	},
// ];

// Validate configuration at runtime
const validationErrors = validator.check(config);

app.get("/", (_, res) => {
	res.json(validationErrors);
});

app.listen(
	config.server.port,
	config.server.host,
	() => {
		console.log(`Server running at http://${config.server.host}:${config.server.port}`);
	},
);
