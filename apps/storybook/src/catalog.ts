/** Story parameters that put the component's description and iOS counterpart on its docs page. */
export const catalog = (ios: string, description?: string) => ({
  docs: {
    description: {
      component: [description, `**iOS counterpart:** ${ios}`]
        .filter(Boolean)
        .join('\n\n'),
    },
  },
});
