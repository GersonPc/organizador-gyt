// Static Assets handles every application route. This fallback only applies to
// unexpected requests outside the published asset routing configuration.
export default {
  fetch(): Response {
    return new Response('Not Found', { status: 404 });
  },
} satisfies ExportedHandler;
