import Fs from 'node:fs';
import { injectable } from 'tsyringe';
import AccountCreationInviteCreator from '../../../../auth/account_creation_invite/AccountCreationInviteCreator.js';
import OAuthConfigurationProvider from '../../../../auth/oauth/OAuthConfigurationProvider.js';
import DatabaseClient from '../../../../database/DatabaseClient.js';
import ProcessBuilder from '../../../../plugins/official/media/_old/ProcessBuilder.js';
import UserProvider from '../../../../user/UserProvider.js';
import type { AuthenticatedSuperUserORpcImplementer, SubRouter } from '../ORpcRouter.js';

@injectable()
export default class AdminORpcRouterFactory {
  constructor(
    private readonly userProvider: UserProvider,
    private readonly databaseClient: DatabaseClient,
    private readonly oAuthConfigurationProvider: OAuthConfigurationProvider,
    private readonly accountCreationInviteCreator: AccountCreationInviteCreator,
  ) {
  }

  create(os: AuthenticatedSuperUserORpcImplementer['admin']): SubRouter<'admin'> {
    return {
      users: {
        list: os.users.list.handler(async ({ context }) => {
          const allUsers = await this.userProvider.findAll(true);

          return {
            loggedInUser: {
              id: context.authSession.user.id,
              displayName: context.authSession.user.displayName,
              isSuperUser: context.authSession.user.isSuperUser,
            },

            users: allUsers.map((user) => ({
                id: user.id,
                displayName: user.displayName,
                blocked: user.blocked,
                isSuperUser: user.isSuperUser,
              }),
            ),
          };
        }),

        get: os.users.get.handler(async ({ input, context, errors }) => {
          const requestedUser = await this.databaseClient.authUser.findUnique({
            where: { id: input.id },
            select: {
              id: true,
              displayName: true,
              blocked: true,
              isSuperUser: true,
              createdAt: true,
              lastLoginDate: true,
              lastActivityDate: true,
            },
          });
          if (requestedUser == null) {
            throw errors.REQUESTED_ENTITY_NOT_FOUND();
          }

          const linkedAuthProviders = await this.databaseClient.authUserLinkedProvider.findMany({
            where: { userId: requestedUser.id },
            select: {
              providerId: true,
              providerUserId: true,
              providerUserDisplayName: true,
              linkedAt: true,
            },
            orderBy: { providerId: 'asc' },
          });

          return {
            loggedInUser: {
              id: context.authSession.user.id,
              displayName: context.authSession.user.displayName,
              isSuperUser: context.authSession.user.isSuperUser,
            },

            user: {
              id: requestedUser.id,
              displayName: requestedUser.displayName,
              blocked: requestedUser.blocked,
              isSuperUser: requestedUser.isSuperUser,
              createdAt: requestedUser.createdAt,
              lastLoginDate: requestedUser.lastLoginDate,
              lastActivityDate: requestedUser.lastActivityDate,
            },
            linkedAuthProviders: linkedAuthProviders.map((linkedProvider) => {
              const providerInfo: {
                identifier: string,
                displayName: string,
              } = this.oAuthConfigurationProvider.getProviderInfo(linkedProvider.providerId) ?? {
                identifiers: linkedProvider.providerId,
                displayName: linkedProvider.providerId,
              };

              return {
                ...providerInfo,
                providerUserId: linkedProvider.providerUserId,
                providerUserDisplayName: linkedProvider.providerUserDisplayName,
                linkedAt: linkedProvider.linkedAt,
              };
            }),
          };
        }),

        updateBlock: os.users.updateBlock.handler(async ({ input, context, errors }) => {
          if (input.id === context.authSession.user.id) {
            throw errors.INVALID_INPUT({ message: 'You cannot (un-)block yourself' });
          }

          await this.databaseClient.$transaction(async (transaction) => {
            await transaction.authUser.update({
              where: {
                id: input.id,
              },
              data: {
                blocked: input.block,
              },
              select: { id: true },
            });

            await transaction.authSession.deleteMany({
              where: { userId: input.id },
            });
          });
        }),

        unlinkAuthProvider: os.users.unlinkAuthProvider.handler(async ({ input }) => {
          await this.databaseClient.authUserLinkedProvider.delete({
            where: {
              userId_providerId: {
                userId: input.id,
                providerId: input.providerId,
              },
            },
          });
        }),
      },

      accountCreationInvitation: {
        create: os.accountCreationInvitation.create.handler(async () => {
          return {
            inviteToken: await this.accountCreationInviteCreator.create(),
          };
        }),
      },

      debug: {
        collectDebugInfo: os.debug.collectDebugInfo.handler(async () => {
          const childProcess = await new ProcessBuilder('pgrep', ['--parent', process.pid.toString()])
            .bufferStdOut()
            .runPromised();

          if (childProcess.err) {
            throw childProcess.err;
          }
          if (childProcess.code != 0 && childProcess.code != 1) {
            throw new Error('Could not find child processes using pgrep');
          }

          const fileDescriptors = [];
          const processIds = [
            process.pid,
            ...childProcess.process.bufferedStdOut.toString('utf-8').split('\n'),
          ];

          for (const pid of processIds) {
            try {
              for (const fd of Fs.readdirSync(`/proc/${pid}/fd`)) {
                const linkTarget = Fs.readlinkSync(`/proc/${pid}/fd/${fd}`);

                fileDescriptors.push({ pid: parseInt(pid.toString(), 10), fd: parseInt(fd, 10), linkTarget });
              }
            } catch (err) {
            }
          }

          const openFileDescriptors = fileDescriptors
            .filter(fd => {
              const linkTarget = fd.linkTarget;
              const shouldIgnore = (linkTarget.startsWith('socket:[') && linkTarget.endsWith(']')) ||
                (linkTarget.startsWith('pipe:[') && linkTarget.endsWith(']')) ||
                (linkTarget.startsWith('anon_inode:[') && linkTarget.endsWith(']')) ||
                linkTarget.startsWith('/dev/pts/') ||
                linkTarget == '/dev/null' ||
                linkTarget.startsWith('/dev/nvidia');
              return !shouldIgnore;
            })
            // Sorts by pid, then fd but current process is always first
            .sort((a, b) => {
              if (a.pid == process.pid) {
                return -1;
              }
              if (b.pid == process.pid) {
                return 1;
              }

              return a.pid - b.pid || a.fd - b.fd;
            })
            .map(fileDescriptor => {
              return {
                fd: fileDescriptor.fd,
                linkTarget: fileDescriptor.linkTarget,
                childProcessPid: fileDescriptor.pid !== process.pid ? fileDescriptor.pid : null,
              };
            });

          return {
            ownProcessId: process.pid,
            nvidiaGpuInUse: fileDescriptors.some(fd => fd.linkTarget.startsWith('/dev/nvidia')),
            openFileDescriptors,
          };
        }),
      },
    };
  }
}
