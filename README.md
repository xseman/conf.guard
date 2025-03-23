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

## Overview

```ts
import path from "node:path";

import { generate } from "conf.guard";

generate({
	tsconfigFilePath: path.join(import.meta.dirname, "./tsconfig.json"),
	inputFile: path.join(import.meta.dirname, "./index.ts"),
	outputFile: path.join(import.meta.dirname, "./check.ts"),
	variableName: "config"
});

// @ts-ignore: Runtime generated
const { validator } = await import("./check.js")

interface Foo {
	bar: number;
	baz: string;
}

const config = {
	foo: {
		bar: 1,
		baz: "baz",
	} as Foo
};

// @ts-ignore: This will fail the validation
// config.foo.bar = "bar";

validator.validate(config)
```
