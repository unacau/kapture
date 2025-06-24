import type { ToolHandler } from './tool-handler.js';
import { prompts } from './yaml-loader.js';

export class PromptHandler {
  constructor(
    private toolHandler: ToolHandler
  ) {}

  public async getPrompt(name: string, args: any): Promise<any> {
    const prompt = prompts.find((p: any) => p.name === name);
    if (!prompt) {
      throw new Error(`Unknown prompt: ${name}`);
    }

    if (name === 'list-tabs') {
      const result = await this.toolHandler.callTool('list_tabs', {});
      const tabsData = JSON.parse(result.content[0].text);
      const tabsArray = tabsData.tabs || [];

      return {
        description: prompt.description,
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: 'Please list all available browser tabs connected to Kapture.'
            }
          },
          {
            role: 'assistant',
            content: {
              type: 'text',
              text: tabsArray.length === 0
                ? `No browser tabs are currently connected to Kapture.

To connect a browser tab:
1. Make sure the Kapture Chrome extension is installed
2. Open Chrome DevTools (F12 on Windows/Linux, Cmd+Option+I on macOS, or right-click → Inspect)
3. Navigate to the "Kapture" panel in DevTools
4. The tab will automatically connect to this server

The server is running on port 61822 and waiting for connections.`
                : `Found ${tabsArray.length} connected browser tab${tabsArray.length === 1 ? '' : 's'}:

${tabsArray.map((tab: any, index: number) => 
`${index + 1}. Tab ID: ${tab.tabId}
   URL: ${tab.url || 'about:blank'}
   Title: ${tab.title || 'New Tab'}
   Connected: ${new Date(tab.connectedAt).toLocaleString()}`
).join('\n\n')}

You can use these tab IDs with other Kapture tools like navigate, click, fill, etc.`
            }
          }
        ]
      };
    }

    if (name === 'tab-details') {
      if (!args?.tabId) {
        throw new Error('tabId argument is required');
      }

      const result = await this.toolHandler.callTool('tab_detail', { tabId: args.tabId });
      const tab = JSON.parse(result.content[0].text);

      return {
        description: prompt.description,
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `Show me detailed information about tab ${args.tabId}.`
            }
          },
          {
            role: 'assistant',
            content: {
              type: 'text',
              text: `Here are the details for tab ${args.tabId}:

**Basic Information:**
- URL: ${tab.url || 'about:blank'}
- Title: ${tab.title || 'New Tab'}
- Tab ID: ${tab.tabId}
- Connected: ${new Date(tab.connectedAt).toLocaleString()}
- Last Active: ${tab.lastPing ? new Date(tab.lastPing).toLocaleString() : 'Unknown'}

**Page Dimensions:**
- Viewport: ${tab.viewportDimensions ? `${tab.viewportDimensions.width}×${tab.viewportDimensions.height}` : 'Unknown'}
- Full Page: ${tab.fullPageDimensions ? `${tab.fullPageDimensions.width}×${tab.fullPageDimensions.height}` : 'Unknown'}
- Scroll Position: ${tab.scrollPosition ? `(${tab.scrollPosition.x}, ${tab.scrollPosition.y})` : 'Unknown'}

**Page Status:**
- Visibility: ${tab.pageVisibility || 'Unknown'}
- DOM Size: ${tab.domSize ? `${tab.domSize.toLocaleString()} nodes` : 'Unknown'}

You can interact with this tab using tools like:
- \`navigate\` to go to a different URL
- \`click\`, \`fill\`, \`select\` for form interactions
- \`screenshot\` to capture the page
- \`evaluate\` to run JavaScript`
            }
          }
        ]
      };
    }

    if (name === 'navigate-to-url') {
      if (!args?.tabId) {
        throw new Error('tabId argument is required');
      }
      if (!args?.url) {
        throw new Error('url argument is required');
      }

      // Verify tab exists by calling tab_detail
      const tabResult = await this.toolHandler.callTool('tab_detail', { tabId: args.tabId });
      const tab = JSON.parse(tabResult.content[0].text);

      let targetUrl = args.url;
      if (!targetUrl.match(/^https?:\/\//i)) {
        targetUrl = `https://${targetUrl}`;
      }

      return {
        description: prompt.description,
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `Navigate tab ${args.tabId} to ${args.url}`
            }
          },
          {
            role: 'assistant',
            content: {
              type: 'text',
              text: `I'll navigate the browser tab to ${targetUrl}.

**Current Tab State:**
- Tab ID: ${tab.tabId}
- Current URL: ${tab.url || 'about:blank'}
- Current Title: ${tab.title || 'New Tab'}

**Navigation Plan:**
1. Navigate to: ${targetUrl}
2. Wait for page to fully load
3. Confirm navigation success

To execute this navigation, use the \`navigate\` tool:
\`\`\`json
{
  "tool": "navigate",
  "arguments": {
    "tabId": "${args.tabId}",
    "url": "${targetUrl}"
  }
}
\`\`\`

**What happens next:**
- The browser will navigate to the new URL
- The page will load completely before the tool returns
- You'll receive the new page title and URL in the response
- If navigation fails, you'll get an error message

**Follow-up actions you might want:**
- Use \`screenshot\` to capture the loaded page
- Use \`evaluate\` to check page content
- Use \`click\` or \`fill\` to interact with page elements`
            }
          }
        ]
      };
    }

    if (name === 'take-screenshot') {
      if (!args?.tabId) {
        throw new Error('tabId argument is required');
      }

      // Verify tab exists by calling tab_detail
      const tabResult = await this.toolHandler.callTool('tab_detail', { tabId: args.tabId });
      const tab = JSON.parse(tabResult.content[0].text);

      const selector = args.selector || null;
      const scale = args.scale || 0.3;
      const format = args.format || 'webp';
      const quality = format === 'png' ? 1.0 : 0.85;

      const validScale = Math.min(Math.max(scale, 0.1), 1.0);
      const validFormats = ['webp', 'jpeg', 'png'];
      const validFormat = validFormats.includes(format) ? format : 'webp';

      return {
        description: prompt.description,
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: selector
                ? `Take a screenshot of the element matching "${selector}" in tab ${args.tabId}`
                : `Take a screenshot of tab ${args.tabId}`
            }
          },
          {
            role: 'assistant',
            content: {
              type: 'text',
              text: `I'll capture a screenshot of ${selector ? `the element matching "${selector}"` : 'the entire page'} from tab ${args.tabId}.

**Current Tab:**
- Tab ID: ${tab.tabId}
- URL: ${tab.url || 'about:blank'}
- Title: ${tab.title || 'New Tab'}

**Screenshot Configuration:**
- Target: ${selector ? `Element with selector "${selector}"` : 'Full page'}
- Scale: ${validScale} (${Math.round(validScale * 100)}% of original size)
- Format: ${validFormat.toUpperCase()}
- Quality: ${quality === 1.0 ? 'Maximum' : `${Math.round(quality * 100)}%`}

**To capture the screenshot, use the \`screenshot\` tool:**
\`\`\`json
{
  "tool": "screenshot",
  "arguments": {
    "tabId": "${args.tabId}"${selector ? `,
    "selector": "${selector}"` : ''},
    "scale": ${validScale},
    "format": "${validFormat}",
    "quality": ${quality}
  }
}
\`\`\`

**What you'll receive:**
- A base64-encoded image in the response
- The image will be displayed directly in the interface
- Format: ${validFormat.toUpperCase()} image data

**Tips:**
${selector ? `- Make sure the element is visible on the page
- If the element is not found, the tool will return an error
- Use specific selectors like "#id" or ".class" for best results` : 
`- The screenshot captures the entire scrollable page content
- Large pages may take longer to capture
- Consider using a selector to capture specific sections`}

**Common use cases:**
- Document visual state of a page
- Capture form data before submission
- Save error messages or important information
- Create visual comparisons of page changes`
            }
          }
        ]
      };
    }

    throw new Error(`Prompt ${name} not implemented`);
  }
}