<template>
  <div class="h-screen flex flex-col bg-gradient-to-br from-blue-50 to-purple-50">
    <div class="flex-1 overflow-hidden flex flex-col max-w-7xl mx-auto w-full p-6">
      <!-- 页面头部 -->
      <div class="flex items-center justify-between mb-6 flex-shrink-0">
        <div>
          <h1 class="text-3xl font-bold text-gray-800">群组管理</h1>
          <p class="text-gray-500 mt-1">创建和管理您的群组</p>
        </div>
        <div class="flex gap-3">
        <n-button @click="goBack" secondary>
          <template #icon>
            <n-icon :component="ArrowBackFilled" />
          </template>
          返回
        </n-button>
        <n-button type="primary" @click="showCreateModal = true">
          <template #icon>
            <n-icon :component="AddFilled" />
          </template>
          创建群组
        </n-button>
        </div>
      </div>

      <!-- 群组列表 - 添加滚动容器 -->
      <div class="flex-1 overflow-hidden">
        <n-scrollbar style="max-height: 100%">
          <n-spin :show="loading">
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pr-4">
          <n-card
            v-for="group in groups"
            :key="group.id"
            hoverable
            class="cursor-pointer shadow-md hover:shadow-xl transition-all"
            @click="handleGroupClick(group)"
          >
            <div class="flex items-start gap-4">
              <n-avatar :size="60" :src="group.avatar || undefined" class="flex-shrink-0">
                {{ group.name.charAt(0) }}
              </n-avatar>
              <div class="flex-1 min-w-0">
                <div class="flex items-center justify-between">
                  <h3 class="font-bold text-lg truncate">{{ group.name }}</h3>
                  <n-tag v-if="group.role === 'owner'" type="warning" size="small">群主</n-tag>
                  <n-tag v-else-if="group.role === 'admin'" type="info" size="small">管理员</n-tag>
                </div>
                <p class="text-sm text-gray-500 mt-1 line-clamp-2">
                  {{ group.description || '暂无简介' }}
                </p>
                <div class="flex items-center gap-4 mt-3 text-xs text-gray-400">
                  <span>👥 {{ group.memberCount }} 成员</span>
                </div>
              </div>
            </div>
            <template #action>
              <div class="flex gap-2">
                <n-button size="small" secondary @click.stop="handleChatClick(group)">
                  聊天
                </n-button>
                <n-button size="small" secondary @click.stop="handleVideoCall(group)">
                  视频
                </n-button>
                <n-button size="small" secondary @click.stop="handleScreenShare(group)">
                  共享
                </n-button>
                <n-dropdown
                  v-if="group.role === 'owner' || group.role === 'admin'"
                  trigger="click"
                  :options="getGroupOptions(group)"
                  @select="(key) => handleGroupAction(key, group)"
                >
                  <n-button size="small" secondary @click.stop>
                    <n-icon :component="MoreVertFilled" />
                  </n-button>
                </n-dropdown>
              </div>
            </template>
          </n-card>

          <!-- 空状态 -->
          <n-empty v-if="!loading && groups.length === 0" class="col-span-full py-20" description="暂无群组">
            <template #extra>
              <n-button type="primary" @click="showCreateModal = true">
                创建第一个群组
              </n-button>
            </template>
          </n-empty>
            </div>
          </n-spin>
        </n-scrollbar>
      </div>

      <!-- 创建群组弹窗 -->
      <n-modal v-model:show="showCreateModal" preset="card" title="创建群组" style="width: 500px">
        <n-form ref="createFormRef" :model="createForm" :rules="createRules">
          <n-form-item label="群组名称" path="name">
            <n-input v-model:value="createForm.name" placeholder="请输入群组名称" maxlength="50" show-count />
          </n-form-item>
          <n-form-item label="群组简介">
            <n-input
              v-model:value="createForm.description"
              type="textarea"
              placeholder="介绍一下您的群组..."
              :rows="3"
              maxlength="200"
              show-count
            />
          </n-form-item>
        </n-form>
        <template #footer>
          <div class="flex justify-end gap-3">
            <n-button @click="showCreateModal = false">取消</n-button>
            <n-button type="primary" :loading="createLoading" @click="handleCreate">
              创建
            </n-button>
          </div>
        </template>
      </n-modal>

      <!-- 群组详情弹窗 -->
      <n-modal v-model:show="showDetailModal" preset="card" :title="currentGroup?.name" style="width: 600px">
        <n-spin :show="detailLoading">
          <n-tabs type="line" animated>
            <!-- 群组信息 -->
            <n-tab-pane name="info" tab="群组信息">
              <div class="space-y-4">
                <div class="flex items-center gap-4">
                  <n-avatar :size="80" :src="groupDetail?.group.avatar || undefined">
                    {{ groupDetail?.group.name.charAt(0) }}
                  </n-avatar>
                  <div>
                    <h3 class="text-xl font-bold">{{ groupDetail?.group.name }}</h3>
                    <p class="text-sm text-gray-500 mt-1">{{ groupDetail?.group.description }}</p>
                  </div>
                </div>
                <n-divider />
                <div class="space-y-2">
                  <p><span class="text-gray-500">群组ID：</span>{{ groupDetail?.group.id }}</p>
                  <p><span class="text-gray-500">成员数量：</span>{{ groupDetail?.members.length }}</p>
                  <p><span class="text-gray-500">我的角色：</span>
                    <n-tag v-if="groupDetail?.myRole === 'owner'" type="warning" size="small">群主</n-tag>
                    <n-tag v-else-if="groupDetail?.myRole === 'admin'" type="info" size="small">管理员</n-tag>
                    <n-tag v-else size="small">成员</n-tag>
                  </p>
                </div>
              </div>
            </n-tab-pane>

            <!-- 成员列表 -->
            <n-tab-pane name="members" tab="成员管理">
              <div class="space-y-3">
              <div v-if="groupDetail?.myRole === 'owner' || groupDetail?.myRole === 'admin'" class="mb-4">
                <n-button type="primary" size="small" @click="showInviteModal = true">
                  <template #icon>
                    <n-icon :component="PersonAddFilled" />
                  </template>
                  邀请成员
                </n-button>
              </div>
                <div
                  v-for="member in groupDetail?.members"
                  :key="member.id"
                  class="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                >
                  <div class="flex items-center gap-3">
                    <n-avatar :size="40" :src="member.avatar || undefined">
                      {{ member.nickname?.charAt(0) || member.username.charAt(0) }}
                    </n-avatar>
                    <div>
                      <div class="font-semibold">{{ member.nickname || member.username }}</div>
                      <div class="text-xs text-gray-500">
                        <n-tag v-if="member.role === 'owner'" type="warning" size="tiny">群主</n-tag>
                        <n-tag v-else-if="member.role === 'admin'" type="info" size="tiny">管理员</n-tag>
                        <n-tag v-else size="tiny">成员</n-tag>
                      </div>
                    </div>
                  </div>
                  <div v-if="groupDetail?.myRole === 'owner' && member.role !== 'owner'" class="flex gap-2">
                    <n-switch
                      :value="member.canSpeak"
                      @update:value="(val) => handleToggleSpeak(member.id, val)"
                      size="small"
                    >
                      <template #checked>可发言</template>
                      <template #unchecked>禁言</template>
                    </n-switch>
                  </div>
                </div>
              </div>
            </n-tab-pane>
          </n-tabs>
        </n-spin>
      </n-modal>

      <!-- 编辑群组弹窗 -->
      <n-modal v-model:show="showEditModal" preset="card" title="编辑群组" style="width: 500px">
        <n-form ref="editFormRef" :model="editForm" :rules="createRules">
          <n-form-item label="群组名称" path="name">
            <n-input v-model:value="editForm.name" placeholder="请输入群组名称" maxlength="50" show-count />
          </n-form-item>
          <n-form-item label="群组简介">
            <n-input
              v-model:value="editForm.description"
              type="textarea"
              placeholder="介绍一下您的群组..."
              :rows="3"
              maxlength="200"
              show-count
            />
          </n-form-item>
        </n-form>
        <template #footer>
          <div class="flex justify-end gap-3">
            <n-button @click="showEditModal = false">取消</n-button>
            <n-button type="primary" :loading="editLoading" @click="handleEdit">
              保存
            </n-button>
          </div>
        </template>
      </n-modal>

      <!-- 邀请成员弹窗 -->
      <n-modal v-model:show="showInviteModal" preset="card" title="邀请成员" style="width: 500px">
        <n-spin :show="usersLoading">
          <n-transfer
            v-model:value="inviteUserIds"
            :options="availableUsers"
            source-filterable
            target-filterable
          />
        </n-spin>
        <template #footer>
          <div class="flex justify-end gap-3">
            <n-button @click="showInviteModal = false">取消</n-button>
            <n-button type="primary" :loading="inviteLoading" @click="handleInvite">
              邀请
            </n-button>
          </div>
        </template>
      </n-modal>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, computed, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useMessage, type FormInst, type FormRules } from 'naive-ui';
import { ArrowBackFilled, AddFilled, MoreVertFilled, PersonAddFilled } from '@vicons/material';
import { 
  getMyGroups, 
  createGroup, 
  getGroupDetail, 
  inviteToGroup, 
  setMemberPermission,
  updateGroup,
  leaveGroup,
  type Group,
  type GroupDetail as GroupDetailType 
} from '@/api/group';
import { getUserList } from '@/api/auth';

const router = useRouter();
const message = useMessage();

const loading = ref(false);
const createLoading = ref(false);
const detailLoading = ref(false);
const inviteLoading = ref(false);
const usersLoading = ref(false);

const showCreateModal = ref(false);
const showDetailModal = ref(false);
const showInviteModal = ref(false);
const showEditModal = ref(false);

const groups = ref<Group[]>([]);
const currentGroup = ref<Group | null>(null);
const groupDetail = ref<GroupDetailType | null>(null);
const allUsers = ref<any[]>([]);
const inviteUserIds = ref<number[]>([]);

const createFormRef = ref<FormInst | null>(null);
const createForm = reactive({
  name: '',
  description: '',
});

const editFormRef = ref<FormInst | null>(null);
const editForm = reactive({
  name: '',
  description: '',
});
const editLoading = ref(false);

const createRules: FormRules = {
  name: [
    { required: true, message: '请输入群组名称', trigger: 'blur' },
    { min: 2, max: 50, message: '群组名称长度在2-50个字符', trigger: 'blur' },
  ],
};

// 可邀请的用户列表
const availableUsers = computed(() => {
  if (!groupDetail.value) return [];
  const memberIds = new Set(groupDetail.value.members.map(m => m.id));
  return allUsers.value
    .filter(user => !memberIds.has(user.id))
    .map(user => ({
      label: user.nickname || user.username,
      value: user.id,
    }));
});

// 加载群组列表
async function loadGroups() {
  try {
    loading.value = true;
    const { groups: list } = await getMyGroups();
    groups.value = list;
  } catch (error: any) {
    message.error('加载群组列表失败: ' + error.message);
  } finally {
    loading.value = false;
  }
}

// 创建群组
async function handleCreate() {
  try {
    await createFormRef.value?.validate();
    createLoading.value = true;

    await createGroup(createForm);
    message.success('创建成功');
    showCreateModal.value = false;
    
    // 重置表单
    createForm.name = '';
    createForm.description = '';
    
    // 重新加载列表
    loadGroups();
  } catch (error: any) {
    message.error('创建失败: ' + error.message);
  } finally {
    createLoading.value = false;
  }
}

// 点击群组卡片
async function handleGroupClick(group: Group) {
  currentGroup.value = group;
  showDetailModal.value = true;
  await loadGroupDetail(group.id);
}

// 加载群组详情
async function loadGroupDetail(groupId: number) {
  try {
    detailLoading.value = true;
    groupDetail.value = await getGroupDetail(groupId);
  } catch (error: any) {
    message.error('加载群组详情失败: ' + error.message);
  } finally {
    detailLoading.value = false;
  }
}

// 加载用户列表
async function loadUsers() {
  try {
    usersLoading.value = true;
    const { users } = await getUserList();
    allUsers.value = users;
  } catch (error: any) {
    message.error('加载用户列表失败: ' + error.message);
  } finally {
    usersLoading.value = false;
  }
}

// 当显示邀请弹窗时加载用户列表
watch(showInviteModal, (newVal) => {
  if (newVal) {
    loadUsers();
  }
});

// 邀请成员
async function handleInvite() {
  if (inviteUserIds.value.length === 0) {
    message.warning('请选择要邀请的用户');
    return;
  }

  try {
    inviteLoading.value = true;
    await inviteToGroup(currentGroup.value!.id, inviteUserIds.value);
    message.success('邀请成功');
    showInviteModal.value = false;
    inviteUserIds.value = [];
    
    // 重新加载群组详情
    if (currentGroup.value) {
      await loadGroupDetail(currentGroup.value.id);
    }
  } catch (error: any) {
    message.error('邀请失败: ' + error.message);
  } finally {
    inviteLoading.value = false;
  }
}

// 切换成员发言权限
async function handleToggleSpeak(userId: number, canSpeak: boolean) {
  try {
    await setMemberPermission(currentGroup.value!.id, userId, canSpeak);
    message.success('权限设置成功');
    
    // 更新本地数据
    if (groupDetail.value) {
      const member = groupDetail.value.members.find(m => m.id === userId);
      if (member) {
        member.canSpeak = canSpeak;
      }
    }
  } catch (error: any) {
    message.error('设置失败: ' + error.message);
  }
}

// 群组操作选项
function getGroupOptions(group: Group) {
  const options: any[] = [];
  
  if (group.role === 'owner' || group.role === 'admin') {
    options.push({
      label: '编辑群组',
      key: 'edit',
    });
  }
  
  if (group.role !== 'owner') {
    options.push({
      label: '退出群组',
      key: 'leave',
    });
  }
  
  return options;
}

// 处理群组操作
async function handleGroupAction(key: string, group: Group) {
  if (key === 'edit') {
    // 编辑群组
    currentGroup.value = group;
    editForm.name = group.name;
    editForm.description = group.description || '';
    showEditModal.value = true;
  } else if (key === 'leave') {
    try {
      await leaveGroup(group.id);
      message.success('已退出群组');
      loadGroups();
    } catch (error: any) {
      message.error('退出失败: ' + error.message);
    }
  }
}

// 群组聊天
function handleChatClick(group: Group) {
  router.push(`/group-chat/${group.id}`);
}

// 群组视频通话
function handleVideoCall(group: Group) {
  router.push(`/group-video/${group.id}`);
}

// 群组屏幕共享
function handleScreenShare(group: Group) {
  router.push(`/group-screen/${group.id}`);
}

// 编辑群组
async function handleEdit() {
  try {
    await editFormRef.value?.validate();
    editLoading.value = true;

    await updateGroup(currentGroup.value!.id, {
      name: editForm.name,
      description: editForm.description,
    });
    
    message.success('编辑成功');
    showEditModal.value = false;
    
    // 重新加载列表
    loadGroups();
  } catch (error: any) {
    if (error.message) {
      message.error('编辑失败: ' + error.message);
    }
  } finally {
    editLoading.value = false;
  }
}

// 返回
function goBack() {
  router.back();
}

onMounted(() => {
  loadGroups();
});
</script>

<style scoped>
.line-clamp-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>

