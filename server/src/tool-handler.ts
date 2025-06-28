import { BrowserCommandHandler } from './browser-command-handler.js';
import { TabRegistry } from './tab-registry.js';
import { allTools } from './yaml-loader.js';

export class ToolHandler {
  constructor(
    private commandHandler: BrowserCommandHandler,
    private tabRegistry: TabRegistry
  ) {}

  private formatTabDetail(tab: any): any {
    return {
      tabId: tab.tabId,
      url: tab.url,
      title: tab.title,
      connectedAt: tab.connectedAt,
      lastPing: tab.lastPing,
      domSize: tab.domSize,
      fullPageDimensions: tab.fullPageDimensions,
      viewportDimensions: tab.viewportDimensions,
      scrollPosition: tab.scrollPosition,
      pageVisibility: tab.pageVisibility
    };
  }

  public getTools() {
    return allTools.map(tool => ({
      name: tool.name,
      description: tool.description,
      inputSchema: (tool as any).jsonSchema || tool.inputSchema
    }));
  }

  public async callTool(name: string, args: any): Promise<any> {
    const tool = allTools.find(t => t.name === name);
    if (!tool) {
      throw new Error(`Unknown tool: ${name}`);
    }

    try {
      // For tools without arguments, use empty object
      const validatedArgs = tool.inputSchema.parse(args || {}) as any;

      // Call the appropriate convenience method based on tool name
      let result: any;
      switch (name) {
        case 'list_tabs':
          const tabs = this.tabRegistry.getAll().map(tab => this.formatTabDetail(tab));
          result = { tabs };
          break;
        case 'tab_detail':
          const tab = this.tabRegistry.get(validatedArgs.tabId);
          if (!tab) {
            throw new Error(`Tab ${validatedArgs.tabId} not found`);
          }
          result = this.formatTabDetail(tab);
          break;
        case 'navigate':
          result = await this.commandHandler.navigate(validatedArgs.tabId, validatedArgs.url, validatedArgs.timeout);
          break;
        case 'back':
          result = await this.commandHandler.goBack(validatedArgs.tabId);
          break;
        case 'forward':
          result = await this.commandHandler.goForward(validatedArgs.tabId);
          break;
        case 'click':
          result = await this.commandHandler.click(validatedArgs.tabId, validatedArgs.selector, validatedArgs.xpath);
          break;
        case 'hover':
          result = await this.commandHandler.hover(validatedArgs.tabId, validatedArgs.selector, validatedArgs.xpath);
          break;
        case 'fill':
          result = await this.commandHandler.fill(validatedArgs.tabId, validatedArgs.value, validatedArgs.selector, validatedArgs.xpath);
          break;
        case 'select':
          result = await this.commandHandler.select(validatedArgs.tabId, validatedArgs.value, validatedArgs.selector, validatedArgs.xpath);
          break;
        case 'keypress':
          // Automatically adjust timeout based on delay
          if (validatedArgs.delay && !validatedArgs.timeout) {
            // Add 2 seconds to the delay for processing overhead
            validatedArgs.timeout = Math.max(5000, validatedArgs.delay + 2000);
          }
          result = await this.commandHandler.keypress(validatedArgs.tabId, validatedArgs.key, {
            selector: validatedArgs.selector,
            xpath: validatedArgs.xpath,
            delay: validatedArgs.delay,
            timeout: validatedArgs.timeout
          });
          break;
        case 'screenshot':
          result = await this.commandHandler.screenshot(validatedArgs.tabId, {
            selector: validatedArgs.selector,
            xpath: validatedArgs.xpath,
            scale: validatedArgs.scale,
            format: validatedArgs.format,
            quality: validatedArgs.quality
          });
          break;
        case 'evaluate':
          result = await this.commandHandler.evaluate(validatedArgs.tabId, validatedArgs.code);
          break;
        case 'dom':
          result = await this.commandHandler.getDom(validatedArgs.tabId, validatedArgs.selector, validatedArgs.xpath);
          break;
        case 'elements':
          result = await this.commandHandler.getElements(validatedArgs.tabId, {
            selector: validatedArgs.selector,
            xpath: validatedArgs.xpath,
            visible: validatedArgs.visible
          });
          break;
        case 'elementsFromPoint':
          result = await this.commandHandler.getElementsFromPoint(validatedArgs.tabId, validatedArgs.x, validatedArgs.y);
          break;
        case 'console_logs':
          result = await this.commandHandler.getConsoleLogs(
            validatedArgs.tabId,
            validatedArgs.before,
            validatedArgs.limit || 100,
            validatedArgs.level
          );
          break;
        default:
          throw new Error(`Unknown tool: ${name}`);
      }

      // Special handling for screenshot tool
      if (name === 'screenshot' && result.dataUrl) {
        const match = result.dataUrl.match(/^data:([^;]+);base64,(.+)$/);
        if (match) {
          const [, mimeType, base64Data] = match;

          const params = new URLSearchParams();
          const screenshotArgs = validatedArgs as any;
          if (screenshotArgs?.selector) params.append('selector', String(screenshotArgs.selector));
          if (screenshotArgs?.xpath) params.append('xpath', String(screenshotArgs.xpath));
          if (screenshotArgs?.scale) params.append('scale', String(screenshotArgs.scale));
          if (screenshotArgs?.format) params.append('format', String(screenshotArgs.format));
          if (screenshotArgs?.quality) params.append('quality', String(screenshotArgs.quality));

          const queryString = params.toString();
          const screenshotUrl = `http://localhost:61822/tab/${screenshotArgs?.tabId}/screenshot/view${queryString ? '?' + queryString : ''}`;

          const enhancedResult = {
            preview: screenshotUrl,
            ...result,
            dataUrl: undefined // Remove original dataUrl to avoid duplication
          };

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(enhancedResult, null, 2)
              },
              {
                type: 'image',
                data: base64Data,
                mimeType: mimeType
              },
            ]
          };
        }
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2)
          }
        ]
      };
    } catch (error: any) {
      if (error.name === 'ZodError') {
        const issues = error.issues.map((issue: any) => issue.message).join(', ');
        throw new Error(issues);
      }
      return {
        content: [
          {
            type: 'error',
            text: JSON.stringify({error: { message: error.message }}, null, 2)
          }
        ],
        isError: true
      };
    }
  }
}
