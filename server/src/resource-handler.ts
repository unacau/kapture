import { TabConnection, TabRegistry } from './tab-registry.js';
import type { ToolHandler } from './tool-handler.js';

export class ResourceHandler {
  constructor(
    private tabRegistry: TabRegistry,
    private toolHandler: ToolHandler
  ) {}

  // Shared resource reading logic
  public async readResource(uri: string): Promise<any> {
    if (uri === 'kapture://tabs') {
      const result = await this.toolHandler.callTool('list_tabs', {});
      const tabsData = JSON.parse(result.content[0].text);
      const tabsArray = tabsData.tabs || [];
      return this.createResourceResponse(uri, tabsArray);
    }

    // Check various resource patterns
    const patterns = [
      { regex: /^kapture:\/\/tab\/(.+)\/console(?:\?.*)?$/, tool: 'console_logs' },
      { regex: /^kapture:\/\/tab\/(.+)\/screenshot(?:\?.*)?$/, tool: 'screenshot' },
      { regex: /^kapture:\/\/tab\/(.+)\/elementsFromPoint(?:\?.*)?$/, tool: 'elementsFromPoint' },
      { regex: /^kapture:\/\/tab\/(.+)\/dom(?:\?.*)?$/, tool: 'dom' },
      { regex: /^kapture:\/\/tab\/(.+)\/elements(?:\?.*)?$/, tool: 'elements' },
      { regex: /^kapture:\/\/tab\/(.+)$/, tool: 'tab_detail' }
    ];

    for (const pattern of patterns) {
      const match = uri.match(pattern.regex);
      if (match) {
        const tabId = match[1];
        const tab = this.tabRegistry.get(tabId);
        if (!tab) {
          throw new Error(`Tab ${tabId} not found`);
        }

        const queryIndex = uri.indexOf('?');
        const params = queryIndex === -1
          ? new URLSearchParams()
          : new URLSearchParams(uri.substring(queryIndex + 1));

        const args = {
          tabId: tab.tabId,
          ...this.paramsToObject(params)
        };

        // Use tool to handle the resource
        return this.callToolAndFormatResponse(pattern.tool, args, tab, uri);
      }
    }

    throw new Error(`Unknown resource: ${uri}`);
  }

  // Helper to create resource response
  private createResourceResponse(uri: string, data: any): any {
    return {
      contents: [
        {
          uri: uri,
          mimeType: 'application/json',
          text: JSON.stringify(data, null, 2)
        }
      ]
    };
  }

  // Helper to convert URLSearchParams to object with type conversion
  private paramsToObject(params: URLSearchParams): Record<string, any> {
    const obj: Record<string, any> = {};
    params.forEach((value, key) => {
      // Try to parse as number
      const numValue = parseFloat(value);
      if (!isNaN(numValue) && numValue.toString() === value) {
        obj[key] = numValue;
      }
      // Try to parse as boolean
      else if (value === 'true' || value === 'false') {
        obj[key] = value === 'true';
      }
      // Keep as string
      else {
        obj[key] = value;
      }
    });
    return obj;
  }


  // Helper to call tool and format response
  private async callToolAndFormatResponse(toolName: string, args: any, tab: TabConnection, uri: string): Promise<any> {
    try {
      const result = await this.toolHandler.callTool(toolName, args);
      const resultData = JSON.parse(result.content[0].text);

      // In MCP, image data is in it's own content item
      const c1 = result.content[1];
      const dataUrl = c1 && c1.type === 'image'? `data:${c1.mimeType};base64,` + c1.data : undefined;

      return this.createResourceResponse(uri, {
        tabId: tab.tabId,
        url: tab.url,
        title: tab.title,
        ...resultData,
        dataUrl
      });
    } catch (error) {
      throw new Error(`Failed to execute ${toolName}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

}
