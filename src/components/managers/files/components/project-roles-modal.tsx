import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { FileRole, FileTopic } from 'api/proto-http/admin';
import { Button } from 'ui/components/button';
import { CalloutBox } from 'ui/components/callout-box';
import { Chip } from 'ui/components/chip';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import { DataTable } from 'ui/components/data-table';
import Input from 'ui/components/input';
import SelectComponent from 'ui/components/select';
import Text from 'ui/components/text';
import { useSnackBarStore } from 'lib/stores/store';
import { failureText } from '../api/rpc-error';
import { topicsService } from '../api/topicsService';
import { invalidateFileViews, useFileRoles } from '../hooks/useFiles';
import { plural } from '../upload/text';
import { ARCHIVED_WORD } from './topic-chips';

/**
 * СЛОВАРЬ РОЛЕЙ ОДНОГО ПРОЕКТА — И ЕДИНСТВЕННОЕ МЕСТО, ГДЕ ЕГО ПРАВЯТ (0323).
 *
 * Общего списка на всю библиотеку больше нет: у роли есть владелец, и «исходники» съёмки —
 * не та же строка, что «исходники» лукбука, даже когда слово одно. Поэтому и экран не общий:
 * слова заводятся там же, где ими пользуются, и проект назван в заголовке, чтобы этого нельзя
 * было не заметить.
 *
 * ПРАВКА РОВНО ОДНА НА ЭКРАН — правило раздела. Второго органа, правящего роли, в панели нет:
 * ни на экране тем (там теперь строка-указатель), ни в полосе выделения (она роль только
 * СТАВИТ, из готового словаря).
 *
 * УДАЛЕНИЯ РОЛИ НЕТ ВОВСЕ — есть архив. Удалённая роль означала бы строки связи, ссылающиеся в
 * никуда; архив оставляет её на файлах и только перестаёт предлагать. Слово в интерфейсе одно
 * на весь раздел (`ARCHIVED_WORD`): `archived`, `retired` и `hidden` — три разных факта на слух
 * и один в базе.
 */
export function ProjectRolesModal({
  project,
  writable,
  onClose,
}: {
  project: FileTopic;
  /** Уже с учётом и права files:write, и тумблера режима. */
  writable: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { showMessage } = useSnackBarStore();
  const projectId = Number(project.id ?? 0);

  // С АРХИВОМ: это словарь, а не пикер. Тот же ключ, которым живут секции страницы, — второго
  // запроса за тем же ответом раздел не заводит.
  const rolesQuery = useFileRoles(projectId, true, projectId > 0);
  const roles = rolesQuery.data?.roles ?? [];

  const invalidate = () => invalidateFileViews(qc);
  const upsertRole = useMutation({ mutationFn: topicsService.upsertRole, onSuccess: invalidate });
  const mergeRoles = useMutation({
    mutationFn: (a: { sourceId: number; targetId: number }) =>
      topicsService.mergeRoles(a.sourceId, a.targetId),
    onSuccess: invalidate,
  });

  const [newRole, setNewRole] = useState('');
  const [editRole, setEditRole] = useState<FileRole | undefined>(undefined);
  const [editRoleName, setEditRoleName] = useState('');
  const [editRoleOrder, setEditRoleOrder] = useState('0');
  const [mergingRole, setMergingRole] = useState<FileRole | undefined>(undefined);
  const [roleMergeTarget, setRoleMergeTarget] = useState('');

  /* ── ЧТО ВООБЩЕ ПРЕДЛАГАТЬ ЦЕЛЬЮ СЛИЯНИЯ ────────────────────────────────────────────────
   *
   * ТОЛЬКО СВОЙ ПРОЕКТ — и это не фильтр списка, а само устройство экрана: `roles` здесь и есть
   * словарь одного проекта. Роли разных проектов сервер слить отказывается
   * (`roles of different projects cannot be merged`), и предложить такую цель значило бы
   * предложить жест, который отвечает отказом.
   *
   * АРХИВНАЯ РОЛЬ ЦЕЛЬЮ НЕ ПРЕДЛАГАЕТСЯ ВОВСЕ. Архив роли — это запрет: сервер отвечает
   * `archived role cannot be assigned` на попытку поставить её одному файлу. Слияние в архивную
   * роль поставило бы её сразу сотне связей и отказа бы не получило — у MergeRoles такой
   * проверки нет. Предлагать в пикере обход собственного запрета нельзя; законный путь есть и
   * он в одно движение — вернуть роль в словарь, слить, убрать обратно.
   */
  const roleMergeTargets = roles.filter(
    (r) => Number(r.id) !== Number(mergingRole?.id) && !r.archived,
  );

  const fail = (e: unknown, fallback: string) => showMessage(failureText(e, fallback), 'error');

  const createRole = async () => {
    const name = newRole.trim();
    if (!name) return;
    try {
      await upsertRole.mutateAsync({
        id: 0,
        // ПРОЕКТ ОБЯЗАТЕЛЕН НА СОЗДАНИИ: без него сервер отвечает `a role can only be created
        // inside a project topic`. Это и есть то самое, чем сломалось заведение роли со старого
        // общего экрана в день выкатки 0323.
        projectTopicId: projectId,
        name,
        sortOrder: roles.length,
        archived: false,
      });
      setNewRole('');
      showMessage(`the role “${name}” is started in “${project.name ?? ''}”`, 'success');
    } catch (e) {
      fail(e, "couldn't start the role");
    }
  };

  const saveRole = async () => {
    if (!editRole) return;
    try {
      await upsertRole.mutateAsync({
        id: Number(editRole.id),
        projectTopicId: projectId,
        name: editRoleName.trim(),
        sortOrder: Number(editRoleOrder) || 0,
        archived: !!editRole.archived,
      });
      setEditRole(undefined);
      showMessage('saved', 'success');
    } catch (e) {
      fail(e, "couldn't save the role");
    }
  };

  const toggleRoleArchive = async (r: FileRole) => {
    try {
      await upsertRole.mutateAsync({
        id: Number(r.id),
        projectTopicId: projectId,
        name: r.name ?? '',
        sortOrder: Number(r.sortOrder ?? 0),
        archived: !r.archived,
      });
      showMessage(
        r.archived ? 'the role is back in the dictionary' : 'the role is put in the archive',
        'success',
      );
    } catch (e) {
      fail(e, "couldn't move the role");
    }
  };

  const doMergeRoles = async () => {
    if (!mergingRole || !roleMergeTarget) return;
    try {
      const res = await mergeRoles.mutateAsync({
        sourceId: Number(mergingRole.id),
        targetId: Number(roleMergeTarget),
      });
      const target = roles.find((r) => String(r.id) === roleMergeTarget);
      setMergingRole(undefined);
      setRoleMergeTarget('');
      showMessage(
        `“${mergingRole.name}” is merged into “${target?.name ?? ''}”, links moved: ${Number(res.movedLinks ?? 0)}`,
        'success',
      );
    } catch (e) {
      fail(e, "couldn't merge the roles");
    }
  };

  return (
    <>
      <ConfirmationModal
        open={!editRole && !mergingRole}
        onOpenChange={(o) => !o && onClose()}
        onConfirm={onClose}
        title={`roles · “${project.name ?? ''}”`}
        confirmLabel='done'
        cancelLabel='close'
        width='md'
      >
        <div className='flex flex-col gap-2'>
          <Text size='micro' variant='label'>
            these words are <b>this project's own</b>: the shoot next door can have its own “raw”
            and it will be a different row. a role sits on the link between the file and the
            project, not as a label on the file — the same shot is raw in the shoot and idea in the
            lookbook.
          </Text>

          {rolesQuery.isLoading ? (
            <Text size='micro' variant='label'>
              loading…
            </Text>
          ) : roles.length === 0 ? (
            <Text size='micro' variant='label'>
              no roles here yet. this project has not needed sub-groups so far, and that is a
              normal state — files sit in it unsorted until a word is worth giving.
            </Text>
          ) : (
            <DataTable>
              <thead>
                <tr>
                  <th data-align='left'>role</th>
                  <th>order</th>
                  <th>files</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {roles.map((r) => {
                  // «Есть ли КУДА слить», а не «сколько ролей всего»: архивная роль целью не
                  // предлагается, и в словаре, где живой осталась одна роль, кнопка обязана
                  // погаснуть, а не открыть пустой пикер.
                  const mergeable = roles.some((o) => Number(o.id) !== Number(r.id) && !o.archived);
                  return (
                    <tr key={r.id}>
                      <td data-align='left'>
                        <Chip selected={!r.archived} dashed={!!r.archived}>
                          {r.name}
                        </Chip>
                        {r.archived && (
                          <Text size='nano' variant='label' component='span' className='ml-1.5'>
                            {ARCHIVED_WORD}
                          </Text>
                        )}
                      </td>
                      <td className='tabular-nums'>{Number(r.sortOrder ?? 0)}</td>
                      {/* СЧЁТ ВНУТРИ ЭТОГО ПРОЕКТА — роль принадлежит ему, значит «в этой роли»
                          и «в этой роли в этом проекте» один и тот же вопрос. Считается он под
                          предикатом видимости, как и всё в этой библиотеке: у разных людей
                          числа здесь законно разные. */}
                      <td className='tabular-nums'>{Number(r.filesCount ?? 0)}</td>
                      <td>
                        <div className='flex flex-wrap items-center justify-end gap-1.5'>
                          <Button
                            size='xs'
                            variant='secondary'
                            disabled={!writable}
                            onClick={() => {
                              setEditRole(r);
                              setEditRoleName(r.name ?? '');
                              setEditRoleOrder(String(Number(r.sortOrder ?? 0)));
                            }}
                          >
                            rename
                          </Button>
                          <Button
                            size='xs'
                            variant='secondary'
                            disabled={!writable || !mergeable}
                            title={
                              mergeable
                                ? undefined
                                : r.archived
                                  ? 'there is nowhere to merge: not one live role is left in this project, and an archived role cannot be the target — bring one back into the dictionary first'
                                  : 'there is nowhere to merge: apart from this one this project has no live roles, and an archived role cannot be the target — bring one back into the dictionary first'
                            }
                            onClick={() => {
                              setMergingRole(r);
                              setRoleMergeTarget('');
                            }}
                          >
                            merge
                          </Button>
                          <Button
                            size='xs'
                            variant='secondary'
                            disabled={!writable}
                            title={
                              r.archived
                                ? 'bring it back into the dictionary — it can be set again'
                                : 'in the archive the role stays on the files and in the filter, but it cannot be set again'
                            }
                            onClick={() => toggleRoleArchive(r)}
                          >
                            {r.archived ? 'bring back' : 'to the archive'}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </DataTable>
          )}

          <div className='flex flex-wrap items-end gap-2'>
            <div className='flex flex-col gap-1'>
              <Text size='micro' variant='label' tracking='label' className='uppercase'>
                new role
              </Text>
              <Input
                name='newRoleName'
                value={newRole}
                placeholder='for example picks'
                disabled={!writable}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewRole(e.target.value)}
                className='w-[220px]'
              />
            </div>
            <Button
              size='sm'
              onClick={createRole}
              disabled={!writable || !newRole.trim() || upsertRole.isPending}
              title={writable ? undefined : 'right now it is read-only — roles are not started'}
            >
              {upsertRole.isPending ? 'starting…' : 'start'}
            </Button>
          </div>
          <Text size='micro' variant='label'>
            this is the ONLY place where a role comes into being, and it comes into being INSIDE a
            project: neither an upload, nor a paste, nor setting topics in bulk can start one —
            they write into topics, and roles do not live there.
          </Text>
        </div>
      </ConfirmationModal>

      <ConfirmationModal
        open={!!editRole}
        onOpenChange={(o) => !o && setEditRole(undefined)}
        onConfirm={saveRole}
        title={`role “${editRole?.name ?? ''}”`}
        confirmLabel={upsertRole.isPending ? 'saving…' : 'save'}
        confirmDisabled={upsertRole.isPending || !editRoleName.trim()}
        closeOnConfirm={false}
        width='sm'
      >
        <div className='flex flex-col gap-2'>
          <div className='flex flex-col gap-1'>
            <Text size='micro' variant='label' tracking='label' className='uppercase'>
              name
            </Text>
            <Input
              name='editRoleName'
              value={editRoleName}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditRoleName(e.target.value)}
            />
          </div>
          <div className='flex flex-col gap-1'>
            <Text size='micro' variant='label' tracking='label' className='uppercase'>
              order
            </Text>
            <Input
              name='editRoleOrder'
              type='number'
              value={editRoleOrder}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setEditRoleOrder(e.target.value)
              }
              className='w-[120px]'
            />
          </div>
          <Text size='micro' variant='label'>
            the order sets how the sections line up on this project's page; on equal values they go
            by name. renaming changes the label on every file of THIS project at once — and only of
            this one: the word belongs to it.
          </Text>
        </div>
      </ConfirmationModal>

      <ConfirmationModal
        open={!!mergingRole}
        onOpenChange={(o) => !o && setMergingRole(undefined)}
        onConfirm={doMergeRoles}
        title={`merge the role “${mergingRole?.name ?? ''}” into another`}
        confirmLabel={mergeRoles.isPending ? 'merging…' : 'merge'}
        confirmDisabled={mergeRoles.isPending || !roleMergeTarget}
        closeOnConfirm={false}
        width='sm'
      >
        <div className='flex flex-col gap-2'>
          <CalloutBox tone='error'>
            <Text size='micro' component='span'>
              every link carrying the role “{mergingRole?.name}” will get the selected one, and “
              {mergingRole?.name}” itself will disappear. <b>this does not come apart back.</b>
            </Text>
          </CalloutBox>
          <div className='flex flex-col gap-1'>
            <Text size='micro' variant='label' tracking='label' className='uppercase'>
              what we merge into
            </Text>
            <SelectComponent
              name='roleMergeTarget'
              value={roleMergeTarget}
              onValueChange={(v: string) => setRoleMergeTarget(v)}
              placeholder='pick a role'
              items={roleMergeTargets.map((r) => ({
                value: String(r.id),
                label: `${r.name} · ${Number(r.filesCount ?? 0)} ${plural(Number(r.filesCount ?? 0), 'file')}`,
              }))}
              fullWidth
            />
          </div>
          <Text size='micro' variant='label'>
            only the roles of “{project.name ?? ''}” are offered: two roles of different projects
            cannot be merged at all — their link rows live in different projects and were never one
            thing. merging is simpler than merging topics, though: a role is a column on the link
            row, not the link itself, so there is nothing to deduplicate.
          </Text>
          {roles.some((r) => r.archived) && (
            <Text size='micro' variant='label'>
              archived roles are not offered as a target: archiving a role means “it cannot be set
              any more”, and merging would set it on every link of the source at once, around that
              ban. if the target really has to be an archived one — bring it back into the
              dictionary, merge, and put it away again.
            </Text>
          )}
        </div>
      </ConfirmationModal>
    </>
  );
}
