import { z } from "zod";

const College = z.object({
  id: z.string(),
  name: z.string(),
  url: z.url(),
  // SIT Nagpur's custom attendance plugin, timetable, academic calendar and portal links (src/lib/sit/).
  sit: z.boolean().optional(),
});
export type College = z.infer<typeof College>;

// Add a college here, or without a code change via COLLEGES='[{"id":"x","name":"X","url":"https://lms.x.edu"}]'.
export const COLLEGES: College[] = [
  { id: "sit-nagpur", name: "Symbiosis Institute of Technology, Nagpur", url: "https://lms.sitnagpur.edu.in", sit: true },
  ...z.array(College).parse(JSON.parse(process.env.COLLEGES ?? "[]")),
];

export const findCollege = (id: string | undefined) => COLLEGES.find((c) => c.id === id);
