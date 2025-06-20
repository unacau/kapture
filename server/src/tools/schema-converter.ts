import { z } from 'zod';

// Convert Zod schema to JSON Schema format for MCP
export function zodToJsonSchema(schema: z.ZodType<any>): any {
  if (schema instanceof z.ZodObject) {
    const shape = schema.shape;
    const properties: any = {};
    const required: string[] = [];

    for (const [key, value] of Object.entries(shape)) {
      properties[key] = zodToJsonSchema(value as z.ZodType<any>);
      
      // Check if field is required
      if (!(value as any).isOptional()) {
        required.push(key);
      }
    }

    return {
      type: 'object',
      properties,
      required: required.length > 0 ? required : undefined
    };
  }

  if (schema instanceof z.ZodString) {
    const schemaWithDesc = schema as any;
    return {
      type: 'string',
      description: schemaWithDesc._def.description
    };
  }

  if (schema instanceof z.ZodNumber) {
    const schemaWithDesc = schema as any;
    const result: any = {
      type: 'number',
      description: schemaWithDesc._def.description
    };
    
    // Add min/max constraints if they exist
    if (schemaWithDesc._def.checks) {
      for (const check of schemaWithDesc._def.checks) {
        if (check.kind === 'min') {
          result.minimum = check.value;
        } else if (check.kind === 'max') {
          result.maximum = check.value;
        }
      }
    }
    
    return result;
  }

  if (schema instanceof z.ZodBoolean) {
    const schemaWithDesc = schema as any;
    return {
      type: 'boolean',
      description: schemaWithDesc._def.description
    };
  }

  if (schema instanceof z.ZodOptional) {
    return zodToJsonSchema(schema.unwrap());
  }

  if (schema instanceof z.ZodDefault) {
    const inner = zodToJsonSchema(schema._def.innerType);
    inner.default = schema._def.defaultValue();
    return inner;
  }

  if (schema instanceof z.ZodEnum) {
    const schemaWithDesc = schema as any;
    return {
      type: 'string',
      enum: schemaWithDesc._def.values,
      description: schemaWithDesc._def.description
    };
  }

  // Handle ZodEffects (created by .refine(), .transform(), etc.)
  if ((schema as any)._def?.typeName === 'ZodEffects') {
    // Get the inner schema from the effects
    const innerSchema = (schema as any)._def.schema;
    return zodToJsonSchema(innerSchema);
  }

  // Default fallback
  return { type: 'string' };
}