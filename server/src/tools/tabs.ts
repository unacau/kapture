import { z } from 'zod';

export const listTabsTool = {
  name: 'list_tabs',
  description: 'List all connected browser tabs',
  inputSchema: z.object({}),
};
