<svelte:head>
  <title>Login</title>
</svelte:head>

<script lang="ts">
  import type {LoginPageData} from '../../../../src/frontend/FrontendRenderingDataAccess';

  const assetThirdPartyLoginLogos: Record<string, any> = import.meta.glob('$lib/assets/login/third-party/*.svg', {
    eager: true,
    query: {enhanced: true}
  });

  const {data}: { data: LoginPageData } = $props();
  const oAuthProvider = data.pageData.oAuthProvider;

  // TODO: Mal https://smashing-freiburg-2024.netlify.app/16-user-valid/ anschauen?
</script>

<div class="row g-0">
  <div class="col-md-5">
    <div class="col-left" style="">
      <div class="col-left-head">
        <img src="/logo.svg" alt="Apollo-Logo" width="764" height="764" style="height: 6rem; width: auto">
        <h1>Login to Apollo</h1>
      </div>

      {#if oAuthProvider.length > 0}
        <div class="third-party-login-container">
          <h6 class="text-muted">Sign in with</h6>

          <div class="d-flex flex-wrap">
            {#each oAuthProvider as provider}
              <a class="p-2 btn btn-outline-secondary" href={provider.href} role="button"><!--
             --><img
                  src={assetThirdPartyLoginLogos[`/src/lib/assets/login/third-party/${provider.id}.svg`].default}
                  class="third-party-img"
                  alt="{provider.displayName}'s logo"
                >&nbsp;{provider.displayName}<!--
           --></a>
            {/each}
          </div>
        </div>

        <div class="hr-section-break mt-4 mb-4">
          <span>or continue with</span>
        </div>
      {/if}

      <div class="first-party-login-container">
        <form method="post" enctype="application/x-www-form-urlencoded">
          <div class="form-floating mb-2">
            <input type="email" class="form-control" id="input_email" name="email" placeholder="" required>
            <label for="input_email">Email address</label>
          </div>

          <div class="form-floating mb-3">
            <input type="password" class="form-control" id="input_password" name="password" placeholder=""
                   required>
            <label for="input_password">Password</label>
          </div>

          <div class="form-check mb-2">
            <input type="checkbox" class="form-check-input" id="input_remember_login" name="remember_login"
                   value="checked" checked>
            <label class="form-check-label" for="input_remember_login">Remember me</label>
          </div>

          <div class="d-grid gap-2">
            <button type="submit" class="btn btn-primary">Log in</button>
          </div>
        </form>
      </div>
    </div>
  </div>

  <div class="col d-none d-md-block">
    <div class="col-right">
      <enhanced:img
        src="$lib/assets/login/background.jpg?w=1920;1280;640;320"
        alt="gray wood beam near body of water surrounded by mountain ranges during daytime"
        class="login-background-image"
        sizes="(min-width: 1200px) 50vw, (min-width: 800px) 75vw, 100vw"
        aria-hidden="true"
      />
    </div>
  </div>
</div>

<style>
  .col-left,
  .col-right {
    width:      100%;
    height:     100%;
    min-height: 100vh;
  }

  .col-left {
    padding: 100px;
  }

  .col-left-head {
    margin-bottom: 4rem;
  }

  .col-right .login-background-image {
    width:  100%;
    height: 100%;
  }

  .third-party-login-container .third-party-img {
    vertical-align: middle;
    height:         2em;
    width:          auto;
  }

  .third-party-login-container .btn {
    flex:          calc(50% - .25rem);
    margin-bottom: .25rem;
  }

  /* To have it symmetric, evenly apply the margin to the left and right of the even/odd elements */
  .third-party-login-container a:nth-child(even) {
    margin-left: .25rem;
  }

  .third-party-login-container a:nth-child(odd) {
    margin-right: .25rem;
  }

  /* Last item should be full width */
  .third-party-login-container a:last-child:nth-child(odd) {
    flex:   50%;
    margin: unset;
  }
</style>
