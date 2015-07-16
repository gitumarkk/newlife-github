var App = {};
App.urls = {
    issues_root: function(state) {
        return "https://api.github.com/repos/newlif/teams/issues?state=" + state;
    },
    issue_comments: function(number_id) {
        return "https://api.github.com/repos/newlif/teams/issues/" + number_id + "/comments";
    }
};

App.GithubIssuesModel = Backbone.Model.extend({
    urlRoot: "https://api.github.com/repos/newlif/teams/issues",
    // initialize: function(options) {
    //     var self = this;
    //     return self;
    // },
    // url: function() {
    //     var self = this;
    //     return self.instanceUrl;
    // },
});

App.GithubIssuesCollection = Backbone.Collection.extend({
    model: App.GithubIssuesModel,
    url: App.urls.issues_root("open"),
    comparator: function(m) {
        var self = this;
        return Date.parse(m.get("milestone").due_on);
    },

    git_labels: function() {
        var self = this,
            models = self.models;
        var labels = _.flatten(_.map(self.models, function (item) {
            return item.attributes.labels;
        }));
        return _.sortBy(_.uniq(labels, function(item) { return item.name; }), "name");
    },
    getCollectionLabel: function(label) {
        var self = this;
        var filteredCollection = this.filter(function(model) {
            var labels = _.map(_.flatten(model.get("labels")), function(item) {
                return item.name;
            });
            return labels.indexOf(label) !== -1;
        });
        return _.map(filteredCollection, function(model) {
            return model.attributes;
        });
    }
});

App.GithubCommentsModel = Backbone.Model.extend({
    idAttribute: "id",
    initialize: function(options) {
        var self = this;
        self.instanceUrl = options.url;
        return self;
    },
    url: function() {
        var self = this;
        return self.instanceUrl;
    }
});

App.GithubCommentsCollection = Backbone.Collection.extend({
    model: App.GithubCommentsModel,
    initialize: function(options) {
        var self = this;
        self.instanceUrl = options.url;
        return self;
    },
    url: function() {
        var self = this;
        return self.instanceUrl;
    }
    // comparator: function(m) {
    //     var self = this;
    //     return Date.parse(m.get("milestone").due_on);
    // }
});


App.AppView = Backbone.View.extend({
    el: "#workspace",
    git_collection: new App.GithubIssuesCollection(),
    git_comment_collection: undefined,
    events: {
        "click .issues-nav a": "renderLabel",
        "click .view-issue": "viewIssue"
    },
    initialize: function(options) {
        var self = this;
        _.bindAll(
            self,
            "render",
            "renderLabel",
            "viewIssue",
            "renderComments",
            "gitFetchError");

        self.issues_template = _.template($("#github-issues-template").html());
        self.comments_template = _.template($("#github-issue-comments-template").html());
        self.git_collection.fetch({
            success: self.render,
            error: self.gitFetchError
        });

        return this;
    },
    /**
    * Rendering the main workspace view and populating labels. Also renders
    * overall issues
    */
    render: function() {
        var self = this,
            labels = self.git_collection.git_labels();

        _.each(labels, function(label) {
            self.$("#issues-nav").append(
                '<li role="presentation" class="issues-nav"><a data-label="' + label.name +
                '" href="#">' + label.name + '</a></li>');
        });

        self.$("#workspace-items").html(self.issues_template({
            issues: self.git_collection.toJSON()
        }));
    },

    renderLabel: function(ev) {
        var self = this,
            $element = $(ev.currentTarget),
            label = $element.data("label");

        self.$("#issue-nav li").removeClass("active");

        ev.preventDefault();

        if (label === "default") {
            self.$("#workspace-items").html(self.issues_template({
                issues: self.git_collection.toJSON()
            }));
        } else {
            self.$("#workspace-items").html(self.issues_template({
                issues: self.git_collection.getCollectionLabel(label)
            }));
        }
        $element.addClass("active");
    },

    viewIssue: function(ev) {
        var self = this, $element;
        ev.preventDefault();
        $element = $(ev.currentTarget);
        self.git_comment_collection = new App.GithubCommentsCollection({
            url: $element.data("comments-url")
        });
        self.git_comment_collection.fetch({
            success: self.renderComments,
            error: self.gitFetchError
        });
    },

    renderComments: function() {
        var self = this, comments;
        comments = self.git_comment_collection.toJSON();
        _.each(comments, function(comment) {
            var issue = self.git_collection.findWhere({
                url: comment.issue_url
            });

            if (issue) {
                comment.issue_title = issue.attributes.title;
            }
        });

        self.$("#workspace-items").html(self.comments_template({comments: comments}));
    },

    gitFetchError: function(response, options, status) {
        var self = this;
        console.error(response, options);
    },
    getIssueTitleForComments: function(comments_url) {
        var self = this;
    },
});

$(document).ready(function() {
    new App.AppView({});
});
