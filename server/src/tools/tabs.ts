import { z } from 'zod';

export const listTabsTool = {
  name: 'kapturemcp_list_tabs',
  description: 'List all connected browser tabs',
  inputSchema: z.object({}),
};
