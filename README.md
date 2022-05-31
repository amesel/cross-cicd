# アカウントをまたいだCodePipelineのサンプル
本番アカウントのCodePipelineを使用して、開発アカウント上のCodeCommitリポジトリからソースコードを取得し、本番アカウントのS3バケットにフロントエンド用のアプリケーションをデプロイするサンプル。

## 前提条件
- 開発アカウントのCodeCommitリポジトリ(cross-cicd-app)は予め作成されている。
- 本番アカウントのデプロイ先のS3バケット(cross-cicd-app-222222222222)は予め作成されている。

## 設定

### 開発アカウント
`/env/dev.ts`
```
export const config = {
  account: '111111111111',
  region: 'ap-northeast-1',
  repositoryName: 'cross-cicd-app',
  branch: 'develop', // 開発用ブランチ
  crossAccountRoleName: 'cross-cicd-role',　
  deployBucketName: 'cross-cicd-app-111111111111' // 開発用デプロイ先S3バケット
};
```

repositoryName: CodeCommitのリポジトリ名
crossAccountRoleName: 本番アカウントのCodePipelineから使用されるIAMロール

### 本番アカウント
`/env/prod.ts`
```
export const config = {
  account: '222222222222',
  region: 'ap-northeast-1',
  repositoryArn: 'arn:aws:codecommit:ap-northeast-1:111111111111:cross-cicd-app',
  branch: 'main',
  crossAccessRoleArn: 'arn:aws:iam::111111111111:role/cross-cicd-role',
  deployBucketName: 'cross-cicd-app-222222222222'
};
```

repositoryArn: 開発アカウントのCodeCommitリポジトリARN
branch: 取得元のブランチ
crossAccessRoleArn: CodePipelineから使用する開発アカウントのIAMロールARN
deployBucketName: デプロイ先S3バケット

## 構成

1. 開発アカウント側のパイプライン
`lib/dev-pipeline-stack.ts`
開発アカウントのCodeCommitのdevelopブランチにマージされると、CloudWatch Eventにより、自動で開発アカウント内のCodePipelineが起動され、開発アカウントのデプロイ先のS3バケット(cross-cicd-app-111111111111)にデプロイされる。

2. 本番アカウント側のパイプライン
`lib/prod-pipeline-stack.ts`
開発アカウントのCodeCommitのmainブランチにマージ。CloudWatch Eventの設定を入れていないので、自動で本番アカウント側のCodePipelineは起動されない。
本番アカウントのデプロイ用IAMユーザーでAWSコンソールにログインし、CodePipeline画面で該当のパイプラインを選択し、「変更をリリースする」ボタンを押しデプロイを開始する。

本番環境のCodePipelineのSourceアクションで、開発アカウントのCodeCommitに接続できるクロスアカウント用のIAMロールをAssumeRoleし、本番環境から開発環境のリポジトリにアクセスしている。
クロスアカウント用のIAMロールには、
- 開発環境のCodeCommitへの読み取り権限
- 本番環境のCodePipelineのアーティファクトS3バケットへの書き込み権限
- 本番環境のCodePipelineのアーティファクトS3バケットの暗号化で使用するKMSキーへのアクセス権限
が必要となる。（開発環境のIAMロールから、本番環境のS3、KMSへのアクセスが発生する）

デプロイは、アプリのルート直下の`buildspec.yml`を参照し実行される。
CodeBuildの環境変数`buildenv`に、`prod`を設定している。
`buildspec.yml`内ではS3バケット`cross-cicd-app-222222222222`に`s3 sync`コマンドでファイルをデプロイしている。

buildspec.ymlのサンプル
```
version: 0.2
phases:
  pre_build:
    commands:
      - TZ=Asia/Tokyo date >| ./public/index.html
      - echo ${buildenv} >> ./public/index.html
      - echo ${CODEBUILD_RESOLVED_SOURCE_VERSION} >> ./public/index.html
      - AWS_ACCOUNT_ID=$(echo ${CODEBUILD_BUILD_ARN} | cut -f 5 -d :)
      - echo ${AWS_ACCOUNT_ID}
  build:
    commands:
      - echo "Build Start on `date`"
      - aws s3 sync --exact-timestamps --delete ./public s3://cross-cicd-app-${AWS_ACCOUNT_ID}
```

