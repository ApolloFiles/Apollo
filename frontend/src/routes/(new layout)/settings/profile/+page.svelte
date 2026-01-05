<script lang="ts">
  import TablerIcon from '$lib/components/TablerIcon.svelte';
  import { getClientSideRpcClient } from '$lib/oRPCClientSide';
  import { getUserProfile } from '$lib/stores/UserProfileStore.svelte';

  const userProfile = getUserProfile();

  let isEditing = $state(false);
  let editDisplayName = $state('');
  let isSavingDisplayName = $state(false);
  let isUploadingAvatar = $state(false);
  let isDeletingAvatar = $state(false);
  let fileInput: HTMLInputElement;

  async function toggleEdit() {
    if (isEditing) {
      if (editDisplayName.trim() !== '' && editDisplayName.trim() !== userProfile.displayName) {
        isSavingDisplayName = true;
        try {
          await getClientSideRpcClient().user.settings.profile.updateDisplayName({ displayName: editDisplayName });
          userProfile.updateDisplayName(editDisplayName);
        } finally {
          isSavingDisplayName = false;
          isEditing = false;
        }
      } else {
        isEditing = false;
      }
    } else {
      editDisplayName = userProfile.displayName;
      isEditing = true;
    }
  }

  async function handleFileUpload(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      isUploadingAvatar = true;
      try {
        await getClientSideRpcClient().user.settings.profile.updateProfilePicture({ file: input.files[0] });
        userProfile.indicateProfilePictureChanged();
      } finally {
        isUploadingAvatar = false;
      }
    }
  }

  function triggerUpload() {
    fileInput.click();
  }

  async function deleteAvatar(): Promise<void> {
    isDeletingAvatar = true;
    try {
      await getClientSideRpcClient().user.settings.profile.updateProfilePicture({ file: null });
      userProfile.indicateProfilePictureChanged();
    } finally {
      isDeletingAvatar = false;
    }
  }
</script>

<svelte:head>
  <title>Profile Settings - Apollo</title>
</svelte:head>

<div class="profile-settings-page">
  <header class="settings-header">
    <h1>Profile Settings</h1>
    <p class="subtitle">
      Manage your <span class="text-decoration-underline"><strong>public</strong></span> profile information
    </p>
  </header>

  <div class="settings-card">
    <!-- Profile Picture Section -->
    <div class="avatar-section">
      <div class="avatar-container">
        <img
          src={userProfile.profilePictureUri}
          alt=""
          class="profile-avatar bg-info"
        />
      </div>
      <div class="avatar-info">
        <h3>Profile Picture</h3>
        <p>A picture helps people recognize you.</p>
        <div class="d-flex gap-2 mt-3">
          <input
            type="file"
            bind:this={fileInput}
            onchange={handleFileUpload}
            class="d-none"
            accept="image/*"
          />
          <button
            class="btn btn-outline-primary btn-sm d-flex align-items-center gap-1"
            onclick={triggerUpload}
            disabled={isUploadingAvatar || isDeletingAvatar}
          >
            {#if isUploadingAvatar}
              <TablerIcon icon="loader-2" spin={true} />
              Uploading...
            {:else}
              Upload new image
            {/if}
          </button>
          <button
            class="btn btn-outline-danger btn-sm d-flex align-items-center gap-1"
            onclick={deleteAvatar}
            disabled={isUploadingAvatar || isDeletingAvatar}
          >
            {#if isDeletingAvatar}
              <TablerIcon icon="loader-2" spin={true} />
              Deleting...
            {:else}
              <TablerIcon icon="trash" />
              Delete
            {/if}
          </button>
        </div>
      </div>
    </div>

    <hr class="divider" />

    <!-- Fields Section -->
    <div class="fields-section">
      <div class="field-item">
        <div class="field-label-group">
          <label for="displayName">Display Name</label>
          <span class="field-description"
          >Visible to other users on this server.</span
          >
        </div>

        <div class="field-control">
          {#if isEditing}
            <form onsubmit={(event) => {event.preventDefault(); toggleEdit();}} style="display: contents">
              <!-- svelte-ignore a11y_autofocus -->
              <input
                id="displayName"
                type="text"
                bind:value={editDisplayName}
                class="form-input"
                autofocus
                disabled={isSavingDisplayName}
              />
            </form>
          {:else}
            <div class="readonly-value">{userProfile.displayName}</div>
          {/if}

          <button
            class="btn-icon-action"
            onclick={toggleEdit}
            aria-label={isEditing ? "Save" : "Edit"}
            disabled={isSavingDisplayName}
          >
            {#if isSavingDisplayName}
              <TablerIcon icon="loader-2" spin={true} />
            {:else if isEditing}
              <TablerIcon icon="check" />
            {:else}
              <TablerIcon icon="edit" />
            {/if}
          </button>
        </div>
      </div>
    </div>
  </div>

  <div class="account-lookup-info">
    <p>
      Unique Account Identifier: <code class="user-id">{userProfile.id}</code>
    </p>
  </div>
</div>

<style>
  .profile-settings-page {
    max-width:      800px;
    margin:         0 auto;
    padding-bottom: 40px;
  }

  .settings-header {
    margin-bottom: 30px;
  }

  .settings-header h1 {
    font-size:     2rem;
    font-weight:   700;
    margin-bottom: 8px;
  }

  .subtitle {
    color:     var(--text-secondary);
    font-size: 1.1rem;
  }

  .settings-card {
    background-color: var(--secondary-bg);
    border:           1px solid var(--border-color);
    border-radius:    12px;
    padding:          30px;
    box-shadow:       0 4px 20px var(--card-shadow);
  }

  .avatar-section {
    display:       flex;
    align-items:   center;
    gap:           30px;
    margin-bottom: 30px;
  }

  .avatar-container {
    position:      relative;
    width:         120px;
    height:        120px;
    border-radius: 50%;
    overflow:      hidden;
  }

  .profile-avatar {
    width:      100%;
    height:     100%;
    object-fit: cover;
  }

  .avatar-info h3 {
    margin:    0 0 5px 0;
    font-size: 1.2rem;
  }

  .avatar-info p {
    color:     var(--text-secondary);
    font-size: 0.95rem;
    margin:    0;
  }

  .divider {
    border:     none;
    border-top: 1px solid var(--border-color);
    margin:     30px 0;
  }

  .field-item {
    display:         flex;
    justify-content: space-between;
    align-items:     flex-start;
    margin-bottom:   35px;
    gap:             20px;
  }

  .field-label-group {
    flex: 1;
  }

  .field-label-group label {
    display:       block;
    font-weight:   600;
    margin-bottom: 4px;
    font-size:     1.05rem;
  }

  .field-description {
    display:   block;
    color:     var(--text-secondary);
    font-size: 0.85rem;
  }

  .field-control {
    flex:        1.5;
    display:     flex;
    align-items: center;
    gap:         15px;
    min-height:  42px;
  }

  .readonly-value {
    font-size: 1.1rem;
    color:     var(--text-primary);
    flex:      1;
  }

  .form-input {
    flex:             1;
    background-color: var(--input-bg);
    border:           1px solid var(--border-color);
    border-radius:    6px;
    padding:          8px 12px;
    color:            var(--text-primary);
    font-size:        1rem;
    transition:       all 0.2s ease;
  }

  .form-input:focus {
    outline:          none;
    border-color:     var(--accent-color);
    background-color: var(--input-focus-bg);
  }

  .btn-icon-action {
    background:      none;
    border:          1px solid var(--border-color);
    border-radius:   6px;
    width:           38px;
    height:          38px;
    display:         flex;
    align-items:     center;
    justify-content: center;
    cursor:          pointer;
    color:           var(--text-secondary);
    transition:      all 0.2s ease;
    flex-shrink:     0;
  }

  .btn-icon-action:hover {
    background-color: var(--hover-bg);
    color:            var(--text-primary);
    border-color:     var(--text-muted);
  }

  .account-lookup-info {
    margin-top: 1.25rem;
    text-align: center;
    font-size:  0.8rem;
    opacity:    0.5;
  }

  .user-id {
    font-family:   monospace;
    background:    rgba(255, 255, 255, 0.05);
    padding:       2px 6px;
    border-radius: 4px;
  }

  @media (max-width: 600px) {
    .field-item {
      flex-direction: column;
      align-items:    stretch;
    }

    .field-control {
      margin-top: 10px;
    }

    .avatar-section {
      flex-direction: column;
      text-align:     center;
    }
  }
</style>
