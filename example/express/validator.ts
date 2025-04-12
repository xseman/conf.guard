/* tslint:disable */
/* eslint-disable */

// @ts-nocheck: This file is generated and should not be type-checked

export interface Properties {
	[property: string]: ValidationSchema
}

export interface ValidationSchema {
	type?: string | string[];
	required?: string[];
	properties?: Properties;
	items?: ValidationSchema;
	enum?: any[];
	$ref?: string;
	allOf?: ValidationSchema[];
	oneOf?: ValidationSchema[];
	format?: string;
	nullable?: boolean;
	additionalProperties?: boolean | ValidationSchema;
	// JSON Schema specific fields
	title?: string;
	description?: string;
	default?: any;
	$schema?: string;
	$id?: string;
};

// Simplified validation error interface
export interface ValidationError {
    path: string;      // Property path (e.g. "user.address.zipCode")
    value: any;        // The actual value that failed validation
    expected: string;  // Expected type as a string (e.g. "string", "boolean", "SomeInterfaceName")
}

export class ConfigValidator {
    private errors: ValidationError[] = [];
    private schemas: Record<string, ValidationSchema> = {};
    private rootSchema: ValidationSchema;

    constructor(schemas: Properties) {
        // Store all schema definitions for reference resolution
        this.schemas = schemas;
        
        // Create a root schema that will validate the config object
        this.rootSchema = {
            type: 'object',
            properties: {}
        };
        
        // Generate top-level property validations
        for (const key in schemas) {
            // Skip any system properties in the schemas
            if (key.startsWith('$') || key === 'type' || key === 'definitions') {
                continue;
            }
            
            // Add regular properties to the root schema
            this.rootSchema.properties![key] = this.getSchemaReference(key);
        }
    }
    
    private getSchemaReference(key: string): ValidationSchema {
        // If this key exists in schemas, create a reference to it
        if (this.schemas[key]) {
            return { $ref: `#/definitions/${key}` };
        }
        // Otherwise just return a generic object type
        return { type: 'object' };
    }

    // Resolve a reference to its schema
    private resolveRef(ref: string): ValidationSchema | undefined {
        const refName = ref.replace('#/definitions/', '');
        return this.schemas[refName];
    }

    // Get a string representation of the expected type from a schema
    private getExpectedTypeString(schema: ValidationSchema): string {
        // Handle oneOf with only a single entry
        if (schema.oneOf && schema.oneOf.length === 1) {
            // Use the single type directly instead of reporting it as a union
            return this.getExpectedTypeString(schema.oneOf[0]);
        }
        
        // If schema has a title (interface or type name), use that
        if (schema.title) {
            return schema.title;
        }
        
        // If schema is a reference, get the name from the reference
        if (schema.$ref) {
            return schema.$ref.replace('#/definitions/', '');
        }
        
        // For enum, show the possible values
        if (schema.enum) {
            return `one of [${schema.enum.join(', ')}]`;
        }
        
        // For oneOf schemas, indicate it's a union type
        if (schema.oneOf && schema.oneOf.length) {
            return 'union type';
        }
        
        // For allOf schemas, indicate it's an intersection type
        if (schema.allOf && schema.allOf.length) {
            return 'intersection type';
        }
        
        // For arrays, indicate array type
        if (schema.type === 'array') {
            return 'array';
        }
        
        // For primitive types, just return the type
        if (typeof schema.type === 'string') {
            return schema.type;
        }
        
        // For union of types, join them
        if (Array.isArray(schema.type)) {
            return schema.type.join(' | ');
        }
        
        // Default to 'object' if no other type info is available
        return 'object';
    }

    // Add a validation error
    private addError(path: string, value: any, schema: ValidationSchema): void {
        this.errors.push({
            path,
            value,
            expected: this.getExpectedTypeString(schema)
        });
    }

    check(config: unknown): ValidationError[] {
        this.errors = [];
        this.validateAgainstSchema(this.rootSchema, config, '');
        return this.errors;
    }
    
    private validateAgainstSchema(schema: ValidationSchema, value: any, path: string): void {
        // Handle null/undefined values
        if (value === null || value === undefined) {
            if (schema.nullable !== true && 
                !(Array.isArray(schema.type) && schema.type.includes('null'))) {
                this.addError(path, value, schema);
            }
            return;
        }

        // Handle schema references
        if (schema.$ref) {
            const resolvedSchema = this.resolveRef(schema.$ref);
            if (resolvedSchema) {
                this.validateAgainstSchema(resolvedSchema, value, path);
            } else {
                this.addError(
                    path,
                    value,
                    { type: "object", title: `Reference "${schema.$ref}" could not be resolved` }
                );
            }
            return;
        }

        // Handle union types (oneOf)
        if (schema.oneOf && schema.oneOf.length) {
            const tempErrors = [...this.errors];
            this.errors = [];
            
            let isValid = false;
            
            for (const option of schema.oneOf) {
                const startErrorCount = this.errors.length;
                this.validateAgainstSchema(option, value, path);
                
                if (this.errors.length === startErrorCount) {
                    isValid = true;
                    break;
                }
                this.errors = this.errors.slice(0, startErrorCount);
            }
            
            if (!isValid) {
                this.errors = tempErrors;
                // Create a simplified schema for oneOf errors
                const oneOfSchema: ValidationSchema = {
                    oneOf: schema.oneOf,
                    title: "one of multiple types"
                };
                this.addError(path, value, oneOfSchema);
            } else {
                this.errors = tempErrors;
            }
            return;
        }

        // Handle intersection types (allOf)
        if (schema.allOf && schema.allOf.length) {
            for (const subSchema of schema.allOf) {
                this.validateAgainstSchema(subSchema, value, path);
            }
            return;
        }

        // Handle type validation
        if (schema.type) {
            const types = Array.isArray(schema.type) ? schema.type : [schema.type];
            
            // Type-specific validation
            if (!this.validateType(types, value, path, schema)) {
                return; // Skip further validation if type doesn't match
            }
        }
        
        // Object validation
        if (schema.type === 'object' || schema.properties) {
            this.validateObject(schema, value, path);
        }
        
        // Array validation
        else if (schema.type === 'array' && schema.items) {
            this.validateArray(schema, value, path);
        }
        
        // String-specific validation
        else if (schema.type === 'string' && schema.enum) {
            this.validateEnum(schema, value, path);
        }
        
        // Number-specific validation
        else if ((schema.type === 'number' || schema.type === 'integer') && schema.enum) {
            this.validateEnum(schema, value, path);
        }
    }
    
    private validateType(types: string[], value: any, path: string, schema: ValidationSchema): boolean {
        const valueType = Array.isArray(value) ? 'array' : typeof value;
        
        if (!types.includes(valueType) && 
            !(valueType === 'number' && types.includes('integer'))) {
            this.addError(path, value, schema);
            return false;
        }
        return true;
    }
    
    private validateObject(schema: ValidationSchema, obj: any, path: string): void {
        // Check required properties
        if (schema.required) {
            for (const requiredProp of schema.required) {
                if (obj[requiredProp] === undefined) {
                    this.addError(
                        path ? `${path}.${requiredProp}` : requiredProp,
                        undefined,
                        { type: "object", title: "required property" }
                    );
                }
            }
        }
        
        // Validate defined properties
        if (schema.properties) {
            for (const propName in obj) {
                const propValue = obj[propName];
                const propPath = path ? `${path}.${propName}` : propName;
                
                if (schema.properties[propName]) {
                    this.validateAgainstSchema(schema.properties[propName], propValue, propPath);
                } else if (schema.additionalProperties === false) {
                    this.addError(
                        propPath,
                        propValue,
                        { type: "object", title: "no additional properties allowed" }
                    );
                } else if (typeof schema.additionalProperties === 'object') {
                    this.validateAgainstSchema(schema.additionalProperties, propValue, propPath);
                }
            }
        }
    }
    
    private validateArray(schema: ValidationSchema, array: any[], path: string): void {
        if (schema.items) {
            array.forEach((item, index) => {
                this.validateAgainstSchema(schema.items!, item, `${path}[${index}]`);
            });
        }
    }
    
    private validateEnum(schema: ValidationSchema, value: any, path: string): void {
        if (schema.enum && !schema.enum.includes(value)) {
            // Create a specialized schema for enum validation errors
            const enumSchema: ValidationSchema = {
                type: schema.type,
                enum: schema.enum,
                title: `one of [${schema.enum.join(', ')}]`
            };
            this.addError(path, value, enumSchema);
        }
    }
}

const schema: Properties = {
  "$schema": "http://json-schema.org/draft-07/schema#",
  "definitions": {
    "ServerConfig": {
        "type": "object",
        "properties": {
            "port": {
                "type": "number",
                "title": "number"
            },
            "host": {
                "type": "string",
                "title": "string"
            }
        },
        "required": [
            "port",
            "host"
        ]
    },
    "LoggingConfig": {
        "type": "object",
        "properties": {
            "level": {
                "oneOf": [
                    {
                        "type": "string",
                        "enum": [
                            "debug"
                        ]
                    },
                    {
                        "type": "string",
                        "enum": [
                            "info"
                        ]
                    },
                    {
                        "type": "string",
                        "enum": [
                            "warn"
                        ]
                    },
                    {
                        "type": "string",
                        "enum": [
                            "error"
                        ]
                    }
                ]
            },
            "format": {
                "oneOf": [
                    {
                        "type": "string",
                        "enum": [
                            "json"
                        ]
                    },
                    {
                        "type": "string",
                        "enum": [
                            "text"
                        ]
                    }
                ]
            }
        },
        "required": [
            "level",
            "format"
        ]
    },
    "DatabaseConfig": {
        "type": "object",
        "properties": {
            "host": {
                "type": "string",
                "title": "string"
            },
            "port": {
                "type": "number",
                "title": "number"
            },
            "username": {
                "type": "string",
                "title": "string"
            },
            "password": {
                "type": "string",
                "title": "string"
            },
            "name": {
                "type": "string",
                "title": "string"
            }
        },
        "required": [
            "host",
            "port",
            "username",
            "password",
            "name"
        ]
    },
    "server": {
        "$ref": "#/definitions/ServerConfig",
        "title": "ServerConfig"
    },
    "logging": {
        "$ref": "#/definitions/LoggingConfig",
        "title": "LoggingConfig"
    },
    "database": {
        "$ref": "#/definitions/DatabaseConfig",
        "title": "DatabaseConfig"
    }
},
  "type": "object"
};

export const validator = new ConfigValidator(schema.definitions);
