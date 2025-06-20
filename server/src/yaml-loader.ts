import yaml from 'js-yaml';
import { z } from 'zod';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load YAML files
const toolsYaml = fs.readFileSync(path.join(__dirname, 'tools.yaml'), 'utf8');
const resourcesYaml = fs.readFileSync(path.join(__dirname, 'resources.yaml'), 'utf8');
const promptsYaml = fs.readFileSync(path.join(__dirname, 'prompts.yaml'), 'utf8');

// Parse YAML
const toolsConfig = yaml.load(toolsYaml) as { tools: ToolDefinition[] };
const resourcesConfig = yaml.load(resourcesYaml) as {
  baseResources: any[];
  dynamicTabResources: any[];
};
const promptsConfig = yaml.load(promptsYaml) as { prompts: any[] };

interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: any;
}

// Convert JSON Schema to Zod schema
function jsonSchemaToZod(schema: any): z.ZodType<any> {
  if (!schema || typeof schema !== 'object') {
    return z.any();
  }

  if (schema.type === 'object') {
    const shape: Record<string, z.ZodType<any>> = {};
    
    if (schema.properties) {
      for (const [key, propSchema] of Object.entries(schema.properties)) {
        let zodType = jsonSchemaToZod(propSchema as any);
        
        // Handle default values
        if ((propSchema as any).default !== undefined) {
          zodType = zodType.default((propSchema as any).default);
        }
        
        // Check if property is required
        if (!schema.required || !schema.required.includes(key)) {
          zodType = zodType.optional();
        }
        
        shape[key] = zodType;
      }
    }
    
    let objectSchema: any = z.object(shape);
    
    // Handle oneOf validation (e.g., selector or xpath required)
    if (schema.oneOf) {
      // For selector/xpath pattern
      const hasSelector = schema.oneOf.some((s: any) => 
        s.required && s.required.includes('selector')
      );
      const hasXpath = schema.oneOf.some((s: any) => 
        s.required && s.required.includes('xpath')
      );
      
      if (hasSelector && hasXpath) {
        objectSchema = objectSchema.refine(
          (data: any) => data.selector || data.xpath,
          { message: 'Either selector or xpath must be provided' }
        );
      }
    }
    
    return objectSchema;
  }
  
  if (schema.type === 'string') {
    let stringSchema = z.string();
    
    if (schema.description) {
      stringSchema = stringSchema.describe(schema.description);
    }
    
    if (schema.format === 'url') {
      stringSchema = stringSchema.url();
    }
    
    if (schema.enum) {
      return z.enum(schema.enum as [string, ...string[]]);
    }
    
    return stringSchema;
  }
  
  if (schema.type === 'number') {
    let numberSchema = z.number();
    
    if (schema.description) {
      numberSchema = numberSchema.describe(schema.description);
    }
    
    if (schema.minimum !== undefined) {
      numberSchema = numberSchema.min(schema.minimum);
    }
    
    if (schema.maximum !== undefined) {
      numberSchema = numberSchema.max(schema.maximum);
    }
    
    return numberSchema;
  }
  
  return z.any();
}

// Convert tools
const convertedTools: Record<string, any> = {};

for (const tool of toolsConfig.tools) {
  const zodSchema = jsonSchemaToZod(tool.inputSchema);
  
  convertedTools[`${tool.name}Tool`] = {
    name: tool.name,
    description: tool.description,
    inputSchema: zodSchema,
    jsonSchema: tool.inputSchema  // Keep original JSON Schema for MCP
  };
}

// Export individual tools
export const navigateTool = convertedTools.navigateTool;
export const goBackTool = convertedTools.backTool;
export const goForwardTool = convertedTools.forwardTool;
export const clickTool = convertedTools.clickTool;
export const hoverTool = convertedTools.hoverTool;
export const fillTool = convertedTools.fillTool;
export const selectTool = convertedTools.selectTool;
export const keypressTool = convertedTools.keypressTool;
export const screenshotTool = convertedTools.screenshotTool;
export const evaluateTool = convertedTools.evaluateTool;
export const domTool = convertedTools.domTool;
export const elementsFromPointTool = convertedTools.elementsFromPointTool;
export const querySelectorAllTool = convertedTools.querySelectorAllTool;
export const listTabsTool = convertedTools.list_tabsTool;

// Export all tools array
export const allTools = [
  navigateTool,
  goBackTool,
  goForwardTool,
  clickTool,
  hoverTool,
  fillTool,
  selectTool,
  keypressTool,
  evaluateTool,
  elementsFromPointTool,
  querySelectorAllTool,
  
  // Keeping these around since Claude Desktop doesn't offer great interactions with Resources
  screenshotTool,  // use kapturemcp://tab/{tabId}/screenshot resource instead
  domTool,  // use kapturemcp://tab/{tabId}/dom resource instead
  listTabsTool  // use kapturemcp://tabs resource instead
];

// Export resources
export const baseResources = resourcesConfig.baseResources;
export const dynamicTabResourceTemplates = resourcesConfig.dynamicTabResources;

// Helper function to create dynamic resources for a specific tab
export function createTabResources(tabId: string, tabTitle: string): Map<string, any> {
  const resources = new Map<string, any>();
  
  for (const template of dynamicTabResourceTemplates) {
    const key = template.key.replace('{tabId}', tabId);
    const resource = {
      uri: template.uri.replace('{tabId}', tabId),
      name: template.name.replace('{tabTitle}', tabTitle).replace('{tabId}', tabId),
      description: template.description.replace('{tabTitle}', tabTitle).replace('{tabId}', tabId),
      mimeType: template.mimeType
    };
    resources.set(key, resource);
  }
  
  return resources;
}

// Export prompts
export const prompts = promptsConfig.prompts;