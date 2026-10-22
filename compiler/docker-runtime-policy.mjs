// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

export const DOCKER_BUILD_RUNTIME_POLICY = Object.freeze({
  network: 'none', readOnly: true, user: '10001:10001', capabilities: Object.freeze([]),
  noNewPrivileges: true, pids: 64, memoryMiB: 256, memorySwapMiB: 256, cpus: 1,
  ipc: 'none', nofile: '128:128', core: '0:0',
  tmpfs: Object.freeze([
    '/workspace:rw,noexec,nosuid,nodev,size=32m,uid=10001,gid=10001,mode=0700',
    '/tmp:rw,noexec,nosuid,nodev,size=16m,uid=10001,gid=10001,mode=0700',
  ]),
});

export function dockerBuildRuntimeArguments(containerName, image) {
  const policy = DOCKER_BUILD_RUNTIME_POLICY;
  return [
    'run', '--rm', '--name', containerName,
    '--label', 'com.intentforce.teach-lab.role=disposable-build-job',
    '--network', policy.network, '--read-only', '--user', policy.user,
    '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges:true',
    '--pids-limit', String(policy.pids), '--memory', `${policy.memoryMiB}m`,
    '--memory-swap', `${policy.memorySwapMiB}m`, '--cpus', policy.cpus.toFixed(1),
    '--ipc', policy.ipc, '--ulimit', `nofile=${policy.nofile}`, '--ulimit', `core=${policy.core}`,
    ...policy.tmpfs.flatMap((value) => ['--tmpfs', value]),
    '--env', 'HOME=/tmp/home', '--env', 'NO_UPDATE_NOTIFIER=1', '-i', image,
  ];
}
