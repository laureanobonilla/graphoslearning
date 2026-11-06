-- Pendientes de la boda de Kari y Lau (antes en JSONBin). Ejecuta UNA vez en Supabase → SQL Editor (es seguro repetirlo).
create table if not exists public.boda_tareas (
  id         bigint primary key,
  title      text not null,
  assignee   text not null default 'Ambos' check (assignee in ('Ambos','Kari','Lau')),
  notes      text not null default '',
  completed  boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.boda_tareas enable row level security;   -- sin políticas: solo se accede desde el servidor

-- Datos que estaban en JSONBin (bin 6aa71999…). Los ids se conservan; no pisa lo que ya exista.
insert into public.boda_tareas (id, title, assignee, notes, completed) values
 (1, 'Definir bien lista de invitados', 'Ambos', 'Recordar la que teníamos, ser equitativos en cantidades', false),
 (2, 'Definir tema de Solano', 'Ambos', 'Queda pendiente ver lo de Paola y hablar con él o sencillamente no invitarlo', false),
 (3, 'Cambiar la fecha en el K''la', 'Lau', 'Kari pls darme el contacto', false),
 (4, 'Hablar con la cantante de la iglesia', 'Lau', '', false),
 (5, 'Cambiar fecha en salón', 'Lau', 'Kari pls darme el contacto', false),
 (6, 'Hablar con Andrés Bonilla y con personas encargadas del salón a ver tema del sonido', 'Lau', '', false),
 (7, 'Hacer invitaciones y definir formato', 'Ambos', 'Tomando en cuenta caso Lorna, que se vea bien quién es la persona invitada. ¿Quién lo hace?', false),
 (8, 'Recordar encargados de anillos, etc. en iglesia', 'Kari', '', false),
 (9, 'Hacer nuevamente el curso', 'Ambos', '', false),
 (1789338187146, 'Definir paleta de colores ', 'Ambos', '', false),
 (1789338207013, 'Los anillos', 'Ambos', 'Joyería Chevez', false),
 (1791940850428, 'Copas', 'Kari', 'Guardadas', true)
on conflict (id) do nothing;
