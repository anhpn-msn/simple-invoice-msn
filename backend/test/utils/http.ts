/** supertest types `body` as `any`; this gives the parsed JSON an explicit shape. */
export const bodyOf = <T>(res: { body: unknown }): T => res.body as T;
