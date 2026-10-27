-- 1. Исправляем ограничение целостности: folder_id теперь NULLABLE (NULL = корневой уровень)
alter table public.blocks alter column folder_id drop not null;

-- 2. Триггер для валидации parent_id у папок (защита от межпользовательских ссылок)
create or replace function public.validate_folder_hierarchy()
returns trigger as $$
begin
  if new.parent_id is not null then
    if not exists (
      select 1 from public.folders 
      where id = new.parent_id and user_id = new.user_id and is_deleted = false
    ) then
      raise exception 'Указанная родительская папка не существует или принадлежит другому пользователю';
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer;

create or replace trigger trg_validate_folder_hierarchy
before insert or update on public.folders
for each row execute function public.validate_folder_hierarchy();

-- 3. Триггер для валидации folder_id у блоков
create or replace function public.validate_block_folder()
returns trigger as $$
begin
  if new.folder_id is not null then
    if not exists (
      select 1 from public.folders 
      where id = new.folder_id and user_id = new.user_id and is_deleted = false
    ) then
      raise exception 'Указанная целевая папка не существует или принадлежит другому пользователю';
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer;

create or replace trigger trg_validate_block_folder
before insert or update on public.blocks
for each row execute function public.validate_block_folder();

-- 4. Уточненные RLS-политики с проверкой целостности
drop policy if exists "Пользователь имеет доступ только к своим папкам" on public.folders;
drop policy if exists "Пользователь имеет доступ только к своим блокам" on public.blocks;

create policy "Folders tenant isolation"
  on public.folders for all
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id 
    and (parent_id is null or exists (select 1 from public.folders f where f.id = parent_id and f.user_id = auth.uid()))
  );

create policy "Blocks tenant isolation"
  on public.blocks for all
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id 
    and (folder_id is null or exists (select 1 from public.folders f where f.id = folder_id and f.user_id = auth.uid()))
  );