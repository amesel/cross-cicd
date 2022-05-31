# アカウントをまたいだCodePipelineのサンプル
本番アカウントのCodePipelineを使用して、開発アカウント上にあるCodeCommitリポジトリからソースコードを取得し、本番アカウントのS3バケットにデプロイするCDKのサンプル

# 構築手順

## 1. 準備
- 開発アカウントのCodeCommitリポジトリ(cross-cicd-app)は予め作成されている
- 本番アカウントのデプロイ先のS3バケット(cross-cicd-app-222222222222)は予め作成されている

## 2.　設定ファイルの変更

### 開発アカウント
#### /env/dev.ts
```
export const config = {
  account: '111111111111',
  region: 'ap-northeast-1',
  repositoryName: 'cross-cicd-app',
  branch: 'develop', // 開発用ブランチ
  crossAccountRoleName: 'cross-cicd-role',　
  deployBucketName: 'cross-cicd-app-111111111111' // 開発用デプロイ先のS3バケット
};
```

|  項目  |  説明  |
| ---- | ---- |
|  repositoryName  |  CodeCommitのリポジトリ名  |
|  crossAccountRoleName  |  本番アカウントのCodePipelineから使用されるIAMロール  |

### 本番アカウント
#### /env/prod.ts
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

|  項目  |  説明  |
| ---- | ---- |
|  repositoryArn  |  開発アカウントのCodeCommitリポジトリARN  |
|  branch  |  本番デプロイ用のブランチ  |
|  crossAccessRoleArn  |  CodePipelineから使用する開発アカウントのIAMロールARN  |
|  deployBucketName  |  デプロイ先のS3バケット  |


## credentialsの作成
`~/.aws/credentials`に開発アカウント、本番アカウントそれぞれの認証情報を用意する。
```
[dev]
aws_access_key_id = AKIA****
aws_secret_access_key = ********
[prod]
aws_access_key_id = AKIA****
aws_secret_access_key = ********
```

CDK、CloudFormation、それぞれのリソースの作成、削除ができる権限が付与されている必要がある


## CDKの実行

```
dev環境
$ cdk bootstrap aws://111111111111/ap-northeast-1 --profile prod # 初回だけ
$ cdk deploy DevPipelineStack --profile dev

prod環境
$ cdk bootstrap aws://222222222222/ap-northeast-1 --profile prod # 初回だけ
$ cdk deploy ProdPipelineStack --profile prod
```

bootstrapを実行するのは、それぞれの環境で初回だけ

# 構成

## 1. 開発アカウント側のパイプライン
### lib/dev-pipeline-stack.ts
開発アカウントのCodeCommitのdevelopブランチにマージされると、CloudWatch Eventにより、自動で開発アカウント内のCodePipelineが起動され、開発アカウントのデプロイ先のS3バケット(cross-cicd-app-111111111111)にデプロイされる。

開発側のパイプラインを構築するとともに、本番アカウントのパイプラインで使用されるIAMロールの作成も行っている。

## 2. 本番アカウント側のパイプライン
### lib/prod-pipeline-stack.ts

開発アカウントのCodeCommitのmainブランチにマージする。CloudWatch Eventの設定を入れていないので、自動で本番アカウント側のCodePipelineは起動されない。
本番アカウントのデプロイ用IAMユーザーでAWSコンソールにログインし、CodePipeline画面で該当のパイプラインを選択し、`変更をリリースする`ボタンを押しデプロイを開始する。

本番環境のCodePipelineのSourceアクションで、開発アカウントのCodeCommitに接続できるクロスアカウント用のIAMロールをAssumeRoleし、本番環境から開発環境のリポジトリにアクセスしている。
クロスアカウント用のIAMロールには、

- 開発環境のCodeCommitへの読み取り権限
- 本番環境のCodePipelineのアーティファクトS3バケットへの書き込み権限
- 本番環境のCodePipelineのアーティファクトS3バケットの暗号化で使用するKMSキーへのアクセス権限

が必要となる。（開発環境のIAMロールから、本番環境のS3、KMSへのアクセスが発生する）

デプロイは、アプリのルート直下の`buildspec.yml`を参照し実行される。
CodeBuildの環境変数`buildenv`に、`prod`を設定している。
`buildspec.yml`内ではS3バケット`cross-cicd-app-222222222222`に`s3 sync`コマンドでファイルをデプロイしている。

### buildspec.ymlのサンプル
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
