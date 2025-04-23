# conf.guard

Simple runtime config validator based on types.

## Why

In production, I have often encountered misconfigurations or small typos that
are difficult to catch without a runtime configuration check. Since application
services are loaded lazily, a bad configuration might only surface later in the
application's lifetime.

This is something I have always needed, but I have not been able to find a
similar solution. For now, this is mostly experimental.

## Installation

> [!NOTE]
> This package is native [ESM][mozzila-esm] and no longer provides a
> CommonJS export. If your project uses CommonJS, you will have to convert to ESM
> or use the dynamic [`import()`][mozzila-import] function.

[mozzila-esm]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Modules
[mozzila-import]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/import

### [npm](https://npmjs.com/conf.guard)

```sh
$ npm install conf.guard
```

## Requirements

### TypeScript

This library uses [ts-morph](https://github.com/dsherret/ts-morph) internally to
analyze TypeScript types. For ts-morph to properly resolve types in your
project, your `tsconfig.json` must include at least these settings:

```json
{
	"compilerOptions": {
		"target": "ESNext",
		"module": "NodeNext",
		"moduleResolution": "nodenext"
	}
}
```

Without these settings, ts-morph may fail to properly resolve types, which would
prevent conf.guard from generating accurate runtime validation.

## Examples

### Basic Usage

```ts
import path from "node:path";

import { generate } from "conf.guard";

generate({
	tsconfigFilePath: "./tsconfig.json",
	validator: {
		variableName: "config",
		inputFile: "./index.ts",
		outputFile: "./validator.ts",
	},
});

// @ts-ignore: Runtime generated
const { validator } = await import("./validator.js");

interface Foo {
	bar: number;
	baz: string;
}

const config = {
	foo: {
		bar: 1,
		baz: "baz",
	} as Foo,
};

// @ts-ignore: This will fail the validation
// config.foo.bar = "bar";

validator.check(config);
```

### Server `express` with `nconf`

```ts
import { generate } from "conf.guard";
import express from "express";
import nconf from "nconf";

interface ServerConfig {
	port: number;
	host: string;
}

interface DatabaseConfig {
	host: string;
	port: number;
	username: string;
	password: string;
	name: string;
}

interface Config {
	server: ServerConfig;
	database: DatabaseConfig;
}

generate({
	tsconfigFilePath: "./tsconfig.json",
	validator: {
		variableName: "config",
		inputFile: "./index.ts",
		outputFile: "./validator.ts",
	},
});

const config = nconf
	// variables might make missconfiguration
	.env("__")
	// file might make missconfiguration
	.file("config.json")
	.defaults({
		server: {
			port: 3000,
			host: "localhost",
		},
		database: {
			host: "localhost",
			port: 5432,
		},
	}).get() as Config;

// @ts-ignore: Runtime generated
const { validator } = await import("./validator.js");

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
console.log("Validation:", validationErrors);

// Recover from validation errors or exit...

// Create Express app
const app = express();

app.listen(
	config.server.port,
	config.server.host,
	() => {
		console.log(`Server running at http://${config.server.host}:${config.server.port}`);
	},
);
```
