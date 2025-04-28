import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'; // 追加カメラ操作


// ---  グローバル変数 ---
let scene, camera, renderer, clock;
let characterModel, mixer, animationsMap; // キャラクターモデル、アニメーションミキサー、アニメーション管理用Map
let ground;
const modelPath = 'https://threejs.org/examples/models/gltf/RobotExpressive/RobotExpressive.glb'; // Three.jsのサンプルモデル

// カメラのキャラクターからの相対的な位置を決めるオフセットベクトル
// (X: 横方向, Y: 高さ, Z: 後ろへの距離)
const cameraOffset = new THREE.Vector3(0, 2.5, 5.0);
let targetCameraPosition = new THREE.Vector3(); // 計算用の一時変数
let targetLookAt = new THREE.Vector3(); // 計算用の一時変数
let controls; // OrbitControls用の変数を追加
// ---  グローバル変数終わり ---



// --- 初期化処理 ---
function init() {
    // クロック（時間管理）
    clock = new THREE.Clock();

    // シーン
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87ceeb); // 空色
    scene.fog = new THREE.Fog(0x87ceeb, 10, 50); // 霧（遠くをぼかす）

    // レンダラー（描画装置）
    renderer = new THREE.WebGLRenderer({ antialias: true }); // アンチエイリアス有効
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio); // 高解像度対応
    renderer.shadowMap.enabled = true; // 影を有効化
    document.body.appendChild(renderer.domElement); // HTMLにCanvasを追加

    // カメラ
    camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 5, 10); // 少し後ろ上から見る
    camera.lookAt(0, 1, 0);   // キャラクターのあたりを見る

    // ライト
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6); // 環境光（全体を明るく）
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8); // 平行光源（太陽光のようなもの）
    directionalLight.position.set(5, 10, 7.5);
    directionalLight.castShadow = true; // このライトで影を生成
    // 影の解像度など設定（負荷と品質のトレードオフ）
    directionalLight.shadow.mapSize.width = 1024;
    directionalLight.shadow.mapSize.height = 1024;
    directionalLight.shadow.camera.near = 0.5;
    directionalLight.shadow.camera.far = 50;
    scene.add(directionalLight);
    // scene.add(new THREE.CameraHelper(directionalLight.shadow.camera)); // 影範囲のデバッグ用

    // 地面
    const groundGeometry = new THREE.PlaneGeometry(100, 100);
    const groundMaterial = new THREE.MeshStandardMaterial({ color: 0x777777, side: THREE.DoubleSide }); // 灰色
    ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2; // X軸で-90度回転して水平にする
    ground.receiveShadow = true; // 地面が影を受けるように設定
    scene.add(ground);

    // --- ↓↓↓ GridHelper の追加 ↓↓↓ ---
    const gridSize = 100; // グリッド全体のサイズ (地面の Plane と合わせる)
    const gridDivisions = 50; // グリッドの分割数 (数を増やすと線が細かくなる)
    // グリッドの色 (例: 白)
    const gridHelper = new THREE.GridHelper(gridSize, gridDivisions, 0xffffff, 0xffffff);
    // グリッド線を少し半透明にする
    gridHelper.material.opacity = 0.3;
    gridHelper.material.transparent = true;
    // GridHelper は Y=0 の位置に生成されるので、地面と同じ高さになる
    scene.add(gridHelper);
    // --- ↑↑↑ GridHelper の追加終わり ---



    // モデル読み込み
    loadCharacterModel();

    // --- Raycasterの初期化 ---
    raycaster = new THREE.Raycaster();
    // --- Raycasterの初期化終わり ---

    // --- ↓↓↓ OrbitControls の初期化 ↓↓↓ ---
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enablePan = false; // パン操作（横移動）を禁止 (キャラクター中心なので不要)
    controls.enableDamping = true; // 慣性を有効化（カメラの動きが滑らかになる）
    controls.dampingFactor = 0.05; // 慣性の強さ (小さいほど滑らか)
    controls.screenSpacePanning = false; // false推奨
    controls.minDistance = 3;     // カメラがキャラクターに近づける最小距離
    controls.maxDistance = 15;    // カメラがキャラクターから離れられる最大距離
    controls.maxPolarAngle = Math.PI / 2 - 0.05; // カメラが真下に行きすぎないように角度制限
    controls.target.set(0, 1.2, 0); // ★ とりあえず初期ターゲットを原点の少し上に設定
    controls.update(); // 初期化後に一度 update を呼ぶ
    // --- ↑↑↑ OrbitControls の初期化終わり ---

    // ウィンドウリサイズ対応
    window.addEventListener('resize', onWindowResize);

    // アニメーションループ開始
    animate();

    // --- キーボード操作設定の呼び出し ---
    setupKeyboardControls();
    // --- キーボード操作設定の呼び出し終わり ---

}

// --- モデル読み込み ---
function loadCharacterModel() {
    const loader = new GLTFLoader();
    loader.load(
        modelPath, // 読み込むモデルのパス
        (gltf) => {
            characterModel = gltf.scene;
            characterModel.scale.set(0.5, 0.5, 0.5); // モデルのサイズを調整
            characterModel.position.y = 0; // 地面に立たせる（仮。正確には接地処理が必要）

            // モデル内の各メッシュで影を落とす・受ける設定
            characterModel.traverse((node) => {
                if (node.isMesh) {
                    node.castShadow = true;
                    node.receiveShadow = true;
                }
            });

            scene.add(characterModel);

            // アニメーションミキサーのセットアップ
            mixer = new THREE.AnimationMixer(characterModel);

            // アニメーションクリップをMapに格納（名前でアクセスしやすくするため）
            animationsMap = new Map();

            // --- デバッグ用ログ ---
            console.log('利用可能なアニメーション:', gltf.animations.map(clip => clip.name));
            // --- デバッグ用ログ終わり ---

            gltf.animations.forEach((clip) => {
                animationsMap.set(clip.name, mixer.clipAction(clip));
                // console.log(`アニメーション "${clip.name}" を検出`); // どんなアニメーションがあるか確認
            });

            // 初期アニメーション（例: アイドル）を再生
            const idleAction = animationsMap.get('Idle'); // 'Idle' という名前のアニメーションを探す
            if (idleAction) {
                idleAction.play();
                currentActionName = 'Idle'; // ★ 初期アクション名をセット
            } else if (animationsMap.size > 0) {
                // Idleが見つからなければ最初のアニメーションを再生
                 const firstAction = animationsMap.values().next().value;
                 firstAction.play();
                 // ★ gltf.animations配列の最初のクリップ名を取得する必要がある
                 currentActionName = gltf.animations[0].name; // ★ 初期アクション名をセット
            }

            console.log('キャラクターモデル読み込み完了');
            // ここまで来たら、次のステップ（入力処理など）に進める
        },
        undefined, // 読み込み進行状況のコールバック（今回は使わない）
        (error) => {
            console.error('モデルの読み込みエラー:', error);
        }
    );
}

// --- ウィンドウリサイズ処理 ---
function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// --- アニメーションループ ---
function animate() {
    requestAnimationFrame(animate); // 次のフレームでも animate を呼ぶ
    const delta = clock.getDelta(); // 前のフレームからの経過時間を取得

    // アニメーションミキサーを更新（アニメーションを進める）
    if (mixer) {
        mixer.update(delta);
    }

    // キャラクターとカメラの更新    
    if (characterModel && animationsMap && animationsMap.size > 0) {
        updateCharacter(delta);
        // --- カメラ更新処理の呼び出し ---
        // updateCamera(delta); 固定カメラ更新処理は不要なのでコメントアウト
        // --- カメラ更新処理の呼び出し終わり ---
    }

    // --- OrbitControls の更新 (Dampingを使う場合は必須) ↓↓↓ ---
    if (controls) {
        controls.update();
    }
    // --- OrbitControls の更新終わり ---

    // レンダリング（描画）
    renderer.render(scene, camera);
}

　　// --- ↓↓↓ キャラクター更新処理  ↓↓↓ ---
　　function updateCharacter(delta) {
        const moveDirection = new THREE.Vector3(0, 0, 0);
        let targetAnimation = 'Idle'; // デフォルトの目標アニメーション

        // --- 1. 接地判定 ---
        let wasGrounded = isGrounded; // 前フレームの接地状態を保持
        isGrounded = false; // いったん接地していないと仮定
        if (characterModel) {
        
            // キャラクターの足元（少し上空）から真下にレイを飛ばす
            const rayOrigin = new THREE.Vector3();
            characterModel.getWorldPosition(rayOrigin); // キャラクターの現在位置を取得
            rayOrigin.y += 0.1; // 少し持ち上げて地面に埋まるのを防ぐ
            raycaster.set(rayOrigin, downDirection);
            const intersects = raycaster.intersectObject(ground); // 地面との交差判定
            // レイの最大距離（これより近い地面があれば接地とみなす）
            // モデルの足元から原点までの距離に合わせて調整が必要
            const groundCheckDistance = 0.15;

            if (intersects.length > 0 && intersects[0].distance <= groundCheckDistance) {
                isGrounded = true;
                // 着地した瞬間（前フレームは空中にいた）
                if (!wasGrounded) {
                    velocityY = 0; // 垂直速度をリセット
                }
                // 地面にめり込まないようにY座標を補正
                characterModel.position.y = Math.max(characterModel.position.y, intersects[0].point.y);
            }
        }

        // --- 2. ジャンプ開始 ---
        // ★ PキーやOキーのアニメーション中はジャンプしないように変更
        if (keys.space && isGrounded && currentActionName !== 'Punch' && currentActionName !== 'Dance') {
            velocityY = jumpVelocity; // 上向きの初速を与える
            isGrounded = false; // 空中にいる状態にする
            // ジャンプアニメーションに即時切り替え（フェードなしでも良いかも）
            fadeToAction('Jump', 0.1);
            //currentActionName = 'Jump'; currentActionName は fadeToAction内で更新されるのでコメントアウトする
        }

        // --- 3. 左右・前後の移動と回転 (空中でも操作可能) ---
        // ★ PキーやOキーのアニメーション中は移動しないように変更
        if (currentActionName !== 'Punch' && currentActionName !== 'Dance') {
            if (keys.w || keys.ArrowUp) moveDirection.z -= 1;
            if (keys.s || keys.ArrowDown) moveDirection.z += 1;
            if (keys.a || keys.ArrowLeft) moveDirection.x -= 1;
            if (keys.d || keys.ArrowRight) moveDirection.x += 1;
        } // ★ 移動制限の終わり
        
        if (moveDirection.lengthSq() > 0) {
            moveDirection.normalize();
            const targetAngle = Math.atan2(moveDirection.x, moveDirection.z);
            const targetQuaternion = new THREE.Quaternion();
            targetQuaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), targetAngle);
            characterModel.quaternion.slerp(targetQuaternion, 0.1);

            const moveDistance = moveSpeed * delta;
            characterModel.position.add(moveDirection.multiplyScalar(moveDistance));
        }

        // --- 4. 重力と垂直移動 ---
        if (!isGrounded) {
            // 重力の影響で垂直速度を更新
            velocityY -= gravity * delta;
            // 垂直速度に基づいてY座標を更新
            characterModel.position.y += velocityY * delta;

            // 安全のため、地面より下にいかないようにする簡易処理
            if (characterModel.position.y < 0) {
                 characterModel.position.y = 0;
                 velocityY = 0;
                 isGrounded = true; // 強制的に接地
            }
        }

        // --- 5. 状態に基づいたアニメーション選択 ---
        // ★ PキーやOキーのアニメーション中は他のアニメーションに切り替えない
        if (currentActionName !== 'Punch' && currentActionName !== 'Dance') {

            // まず、現在の状態から目標となるアニメーションを決める
            if (!isGrounded) {

            // 空中にいる間 (ジャンプ上昇中・落下中)
            targetAnimation = 'Jump'; // Jump中はJumpアニメーションを継続させる
　　　　　　    } else {
　　　　        // 地面にいる場合
　　　　        if (moveDirection.lengthSq() > 0) {
　　　　            targetAnimation = 'Running'; // 動いていれば走る
　　　　        } else {
　　　　            targetAnimation = 'Idle'; // 止まっていればアイドル
　　　　        }
　　　　    }

　　　　    // --- 6. アニメーション切り替え実行 ---
　　　　    // 目標アニメーションが現在のアニメーションと違う場合のみ切り替え
            const jumpAction = animationsMap.get('Jump');
            const jumpActionRunningOrScheduled = jumpAction && (jumpAction.isRunning() || mixer.existingAction('Jump', characterModel)); // ジャンプ中か確認

            // 目標アニメーションが現在と違い、かつジャンプ中ではない場合
            // または、ジャンプが終わって着地した瞬間
             if (currentActionName !== targetAnimation) {
                  // ジャンプ中は何もしない (Jumpアニメーションが終わるまで)
                  // または着地してIdle/Runningに切り替える場合
                  if(!jumpActionRunningOrScheduled || (isGrounded && wasGrounded !== isGrounded)) {
                      fadeToAction(targetAnimation, 0.2);
                  }
             }
        } // ★ P/Oアニメーション中の切り替え制限終わり
    }
// --- ↑↑↑ 更新終わり ---




// --- キー入力状態と設定 ---
const keys = {
    w: false, a: false, s: false, d: false, // WASDキー
    ArrowUp: false, ArrowLeft: false, ArrowDown: false, ArrowRight: false, // 矢印キー
    shift: false, // Shiftキー (将来的に歩き/走りの切り替え用)
    space: false  // スペースキージャンプ
};


const moveSpeed = 4; // キャラクターの移動速度 (m/s)
let currentActionName = ''; // 現在再生中のアニメーション名 (例: 'Idle', 'Run')
const gravity = 9.8 * 2; // 重力加速度 (数字が小さいほどゆっくり落下)
const jumpVelocity = 9.0; // ジャンプ時の垂直方向の初速 (数字が大きいほど高く飛ぶ)
let velocityY = 0;       // 現在の垂直方向の速度
let isGrounded = false;    // 地面に接しているかどうかのフラグ
let raycaster;             // 接地判定用のRaycaster
const downDirection = new THREE.Vector3(0, -1, 0); // 真下を示すベクトル

// --- キー入力状態と設定終わり ---

// --- キーボード操作設定 (event.code を使用) ---
function setupKeyboardControls() {
    document.addEventListener('keydown', (event) => {
        // 同じキーが押しっぱなしで連続してイベントが発生するのを防ぐ
        if (event.repeat) return;

        const key = event.key;
        const code = event.code; // ★ キーコードを取得

        // --- P（パンチ）キー と O（ダンス）キー の処理を追加 ---
        if (key === 'p' || key === 'P') {
            // パンチアニメーションを再生 (現在のものがパンチでなければ)
            // ★Idle状態または移動/ジャンプ中にのみトリガー可能にする(任意)
            if (currentActionName !== 'Punch' && currentActionName !== 'Dance' && isGrounded) { // ダンス中は不可、空中でも不可など
                 fadeToAction('Punch', 0.2);
            }
            return; // 他のキー処理（移動など）は行わない
        }
        if (key === 'o' || key === 'O') {
             // ダンスアニメーションを再生 (現在のものがダンスでなければ)
             // ★Idle状態または移動/ジャンプ中にのみトリガー可能にする(任意)
             if (currentActionName !== 'Dance' && currentActionName !== 'Punch' && isGrounded) { // パンチ中は不可、空中でも不可など
                 fadeToAction('Dance', 0.2);
             }
             return; // 他のキー処理（移動など）は行わない
        }
        // ---  P（パンチ）キー と O（ダンス）キー の処理終わり ---


        // --- ↓↓↓ スペースキーの判定を event.code で行う ↓↓↓ ---
        if (code === 'Space') { // 'Space' はスペースキーの code
            keys.space = true;
        } else if (keys.hasOwnProperty(key.toLowerCase())) {
            keys[key.toLowerCase()] = true;
        } else if (keys.hasOwnProperty(key)) { // Arrow keys, Shift
             keys[key] = true;
        }
        // console.log('Key Down:', code, keys); // デバッグ用
    });

    document.addEventListener('keyup', (event) => {
        const key = event.key;
        const code = event.code;

        // --- ↓↓↓ スペースキーの判定を event.code で行う ↓↓↓ ---
        if (code === 'Space') {
            keys.space = false;
        } else if (keys.hasOwnProperty(key.toLowerCase())) {
            keys[key.toLowerCase()] = false;
        } else if (keys.hasOwnProperty(key)) {
             keys[key] = false;
        }
         // console.log('Key Up:', code, keys); // デバッグ用
    });
}
// --- キーボード操作設定終わり ---


// --- アニメーション切り替え関数 (クロスフェード) ---
function fadeToAction(name, duration) {
    // 目標のアニメーションアクションを取得
    const nextAction = animationsMap.get(name);
    if (!nextAction) {
        console.warn(`アニメーション "${name}" が見つかりません`);
        return;
    }

    // 現在のアニメーションアクションを取得
    const previousAction = currentActionName ? animationsMap.get(currentActionName) : null;

    // ★★★ アニメーション完了時の処理リスナーを仕込む ★★★
    // (Jump, Punch など LoopOnce のアニメーションが終わったら Idle に戻す処理)
    const onFinished = (event) => {
        // イベントのアクションが現在のアクションと同じかチェック (古いリスナーが残る可能性対策)
        if (event.action === nextAction) {
            // mixerからリスナーを削除
            mixer.removeEventListener('finished', onFinished);
            // 現在のアクションが完了したアクションのままであればIdleに戻す
            if (currentActionName === name) {
                 fadeToAction('Idle', 0.2);
            }
        }
    };

    // もし現在再生中のアクションがあり、それが次のアクションと違うなら
    if (previousAction && previousAction !== nextAction) {
         // ★ 完了リスナーが登録されていれば削除する (フェードアウト中に完了する場合があるため)
        mixer.removeEventListener('finished', onFinished); // 既存のリスナーを念のため削除しようとする
        previousAction.fadeOut(duration);
    }

    // 次のアクションを準備してフェードイン・再生
    nextAction
        .reset()
        .setEffectiveTimeScale(1)
        .setEffectiveWeight(1)
        .fadeIn(duration)
        .play();



    // 現在のアニメーション名を更新
    currentActionName = name;

    // もし現在再生中のアクションがあり、それが次のアクションと違うならフェードアウト
    if (previousAction && previousAction !== nextAction) {
        previousAction.fadeOut(duration);
    }

    // 次のアクションを準備してフェードイン・再生
    nextAction
        .reset() // アクションをリセット
        .setEffectiveTimeScale(1) // 再生速度を通常に
        .setEffectiveWeight(1)    // アクションの影響度を最大に
        .fadeIn(duration)         // 指定時間でフェードイン
        .play();                  // 再生開始

    // --- アニメーションのループ設定 ---
    // デフォルトはループ再生
    nextAction.setLoop(THREE.LoopRepeat);
    nextAction.clampWhenFinished = false;
    nextAction.stopFading(); // フェードイン中に他のアクションに切り替えられた場合のため

    // Jump または Punch または Dance アニメーションは1回だけ再生
    if (name === 'Jump' || name === 'Punch' || name === 'Dance') {
        nextAction.setLoop(THREE.LoopOnce);
        nextAction.clampWhenFinished = true;
        // ★ 完了したらIdleに戻るようにリスナーを登録
        mixer.addEventListener('finished', onFinished);
    }

    // 現在のアニメーション名を更新
    currentActionName = name;
}

// --- アニメーション切り替え関数 (クロスフェード) 終わり ---


// --- 実行 ---
init();